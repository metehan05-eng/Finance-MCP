import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { round } from "../utils/financeMath.js";

export interface RebalancePosition {
  symbol: string;
  /** Pozisyonun güncel piyasa değeri (tek bir para biriminde). */
  value: number;
}

export interface RebalanceTarget {
  symbol: string;
  /** Hedef ağırlık (yüzde). Toplam %100 olmak zorunda değildir; normalize edilir. */
  weightPct: number;
}

export interface RebalanceRow {
  symbol: string;
  currentValue: number;
  currentWeightPct: number;
  targetWeightPct: number;
  targetValue: number;
  /** targetValue - currentValue: pozitifse al, negatifse sat. */
  difference: number;
  action: "BUY" | "SELL" | "HOLD";
}

export interface RebalancePlan {
  totalValue: number;
  cash: number;
  rows: RebalanceRow[];
  warnings: string[];
}

/**
 * Mevcut pozisyon değerleri ve hedef ağırlıklardan alım-satım planı üretir.
 * Saf matematik; ağ erişimi yoktur. Hedef ağırlıklar %100'e normalize edilir.
 */
export function buildRebalancingPlan(
  positions: RebalancePosition[],
  targets: RebalanceTarget[],
  cash = 0
): RebalancePlan {
  const warnings: string[] = [];

  const current = new Map<string, number>();
  for (const p of positions) {
    const sym = p.symbol.trim().toUpperCase();
    if (!sym) continue;
    current.set(sym, (current.get(sym) ?? 0) + p.value);
  }

  const weights = new Map<string, number>();
  for (const t of targets) {
    const sym = t.symbol.trim().toUpperCase();
    if (!sym) continue;
    weights.set(sym, (weights.get(sym) ?? 0) + t.weightPct);
  }

  const sumWeights = [...weights.values()].reduce((a, b) => a + b, 0);
  const positionsTotal = [...current.values()].reduce((a, b) => a + b, 0);
  const totalValue = positionsTotal + Math.max(0, cash);

  if (weights.size === 0 || sumWeights <= 0) {
    return {
      totalValue,
      cash,
      rows: [],
      warnings: ["Geçerli hedef ağırlık yok; plan üretilemedi."],
    };
  }

  if (Math.abs(sumWeights - 100) > 0.5) {
    warnings.push(`Hedef ağırlıklar toplamı %${round(sumWeights)}; %100'e normalize edildi.`);
  }

  if (totalValue <= 0) {
    return {
      totalValue,
      cash,
      rows: [],
      warnings: ["Toplam portföy değeri sıfır; plan üretilemedi."],
    };
  }

  const symbols = [...new Set([...current.keys(), ...weights.keys()])].sort();
  const rows: RebalanceRow[] = symbols.map((sym) => {
    const currentValue = current.get(sym) ?? 0;
    const targetWeightPct = ((weights.get(sym) ?? 0) / sumWeights) * 100;
    const targetValue = (targetWeightPct / 100) * totalValue;
    const difference = targetValue - currentValue;
    const action: RebalanceRow["action"] =
      Math.abs(difference) < 0.01 ? "HOLD" : difference > 0 ? "BUY" : "SELL";

    if (currentValue === 0 && targetWeightPct > 0) warnings.push(`Yeni pozisyon: ${sym}`);
    if (!weights.has(sym) && currentValue > 0) warnings.push(`Tamamen çıkış: ${sym}`);

    return {
      symbol: sym,
      currentValue,
      currentWeightPct: (currentValue / totalValue) * 100,
      targetWeightPct,
      targetValue,
      difference,
      action,
    };
  });

  if (cash > 0) {
    warnings.push(`Toplam değere ${round(cash)} nakit dahil edildi.`);
  }

  rows.sort((a, b) => b.targetWeightPct - a.targetWeightPct || a.symbol.localeCompare(b.symbol));

  return { totalValue, cash, rows, warnings };
}

/**
 * Mevcut pozisyon değerleri ile hedef ağırlıkları karşılaştırıp alım/satım
 * tutarlarını hesaplar. Fiyat/çevrim gerektirmez; değerler aynı para biriminde
 * verilmelidir.
 */
export function registerGetRebalancingPlan(server: McpServer) {
  server.tool(
    "get_rebalancing_plan",
    "Mevcut pozisyon değerleri ve hedef ağırlıklardan yeniden dengeleme (rebalancing) planı üretir: her varlık için al/sat tutarı, yeni ağırlıklar ve uyarılar. Fiyat çekmez; tüm değerler aynı para biriminde olmalıdır. Örn: A=6000, B=4000 → hedef A %70, B %30.",
    {
      positions: z
        .array(
          z.object({
            symbol: z.string().min(1).describe("Sembol (THYAO, AAPL, BTC-USD)"),
            value: z.number().min(0).describe("Güncel piyasa değeri (tek para biriminde)"),
          })
        )
        .min(1)
        .max(50)
        .describe("Mevcut pozisyonlar ve değerleri"),
      targets: z
        .array(
          z.object({
            symbol: z.string().min(1).describe("Sembol"),
            weightPct: z.number().min(0).max(100).describe("Hedef ağırlık (yüzde)"),
          })
        )
        .min(1)
        .max(50)
        .describe("Hedef ağırlıklar (toplam %100 olmasa da normalize edilir)"),
      cash: z.number().min(0).default(0).describe("Planlamaya dahil edilecek nakit (opsiyonel)"),
      currency: z
        .string()
        .default("TRY")
        .describe("Değerlerin para birimi etiketi (varsayılan TRY)"),
    },
    { readOnlyHint: true },
    async ({ positions, targets, cash, currency }) => {
      try {
        const plan = buildRebalancingPlan(positions, targets, cash);

        if (plan.rows.length === 0) {
          return errorResponse(plan.warnings.join(" ") || "Yeniden dengeleme planı üretilemedi.");
        }

        const buys = plan.rows.filter((r) => r.action === "BUY");
        const sells = plan.rows.filter((r) => r.action === "SELL");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  currency,
                  totalValue: round(plan.totalValue),
                  cashIncluded: round(plan.cash),
                  summary: {
                    buyCount: buys.length,
                    sellCount: sells.length,
                    totalBuy: round(buys.reduce((s, r) => s + r.difference, 0)),
                    totalSell: round(Math.abs(sells.reduce((s, r) => s + r.difference, 0))),
                  },
                  rows: plan.rows.map((r) => ({
                    symbol: r.symbol,
                    currentValue: round(r.currentValue),
                    currentWeightPct: round(r.currentWeightPct),
                    targetWeightPct: round(r.targetWeightPct),
                    targetValue: round(r.targetValue),
                    difference: round(r.difference),
                    action: r.action,
                  })),
                  warnings: plan.warnings,
                  dataNote:
                    "Tutarlar brüttür; komisyon, vergi, kur ve lot yuvarlaması dikkate alınmamıştır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Yeniden dengeleme planı hesaplanamadı: ${msg}`);
      }
    }
  );
}

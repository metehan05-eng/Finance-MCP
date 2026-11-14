import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuoteSummary } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface EtfHolding {
  symbol: string | null;
  name: string | null;
  weightPct: number | null;
}

export interface SectorWeight {
  sector: string;
  weightPct: number;
}

export interface EtfProfile {
  category: string | null;
  legalType: string | null;
  family: string | null;
  netExpenseRatioPct: number | null;
  annualHoldingsTurnoverPct: number | null;
}

export interface EtfTrailingReturns {
  ytdPct: number | null;
  oneMonthPct: number | null;
  threeMonthPct: number | null;
  oneYearPct: number | null;
  threeYearPct: number | null;
  fiveYearPct: number | null;
  tenYearPct: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
const pct = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n * 100;
};

/** topHoldings.holdings dizisini normalize eder (holdingPercent kesirdir). */
export function normalizeTopHoldings(raw: any, limit = 10): EtfHolding[] {
  const list = raw?.holdings;
  if (!Array.isArray(list)) return [];

  return list
    .map((h: any) => ({
      symbol: str(h?.symbol),
      name: str(h?.holdingName),
      weightPct: pct(h?.holdingPercent),
    }))
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
    .slice(0, limit);
}

/** "consumer_cyclical" → "Consumer Cyclical" */
export function prettySector(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** topHoldings.sectorWeightings dizisini tek bir sıralı listeye indirger. */
export function normalizeSectorWeights(raw: any): SectorWeight[] {
  const list = Array.isArray(raw) ? raw : [];
  const totals = new Map<string, number>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    for (const [key, value] of Object.entries(item)) {
      const n = num(value);
      if (n === null || n <= 0) continue;
      totals.set(key, (totals.get(key) ?? 0) + n);
    }
  }

  return [...totals.entries()]
    .map(([sector, weight]) => ({ sector: prettySector(sector), weightPct: weight * 100 }))
    .sort((a, b) => b.weightPct - a.weightPct);
}

/** fundProfile modülünü normalize eder. */
export function normalizeEtfProfile(raw: any): EtfProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const fees = raw.feesExpensesInvestment ?? {};
  const expense =
    num(fees.annualReportExpenseRatio) ?? num(fees.netExpRatio) ?? num(fees.grossExpRatio);
  return {
    category: str(raw.categoryName),
    legalType: str(raw.legalType),
    family: str(raw.family),
    netExpenseRatioPct: expense === null ? null : expense * 100,
    annualHoldingsTurnoverPct: pct(fees.annualHoldingsTurnover),
  };
}

/** fundPerformance.trailingReturns modülünü normalize eder (kesir → yüzde). */
export function normalizeTrailingReturns(raw: any): EtfTrailingReturns | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    ytdPct: pct(raw.ytd),
    oneMonthPct: pct(raw.oneMonth),
    threeMonthPct: pct(raw.threeMonth),
    oneYearPct: pct(raw.oneYear),
    threeYearPct: pct(raw.threeYear),
    fiveYearPct: pct(raw.fiveYear),
    tenYearPct: pct(raw.tenYear),
  };
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface EtfDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuoteSummary: typeof fetchQuoteSummary;
}

export const DEFAULT_ETF_DEPS: EtfDeps = { resolveTickers, fetchQuoteSummary };

/**
 * ETF / yatırım fonu içeriğini (en büyük holdingler, sektör dağılımı, ücret
 * oranı, dönemsel getiriler) döndürür.
 */
export function registerGetEtfHoldings(server: McpServer, deps: EtfDeps = DEFAULT_ETF_DEPS) {
  server.tool(
    "get_etf_holdings",
    "Bir ETF veya yatırım fonunun içeriğini döndürür: en büyük holdingler ve ağırlıkları, sektör dağılımı, gider oranı, kategori ve dönemsel getiriler. Örn: SPY, QQQ, VOO, ARKK.",
    {
      symbol: z.string().min(1).describe("ETF/fon sembolü (SPY, QQQ, VOO, ARKK)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Gösterilecek en büyük holding sayısı (1-50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, limit }) => {
      const upper = symbol.trim().toUpperCase();

      try {
        const resolved = (await deps.resolveTickers([upper])).get(upper) ?? upper;
        const data = await deps.fetchQuoteSummary(resolved, [
          "topHoldings",
          "fundProfile",
          "fundPerformance",
          "price",
          "defaultKeyStatistics",
        ]);

        const price = data.price ?? {};
        const holdings = normalizeTopHoldings(data.topHoldings, limit);
        const sectors = normalizeSectorWeights(data.topHoldings?.sectorWeightings);
        const profile = normalizeEtfProfile(data.fundProfile);
        const returns = normalizeTrailingReturns(data.fundPerformance?.trailingReturns);

        if (holdings.length === 0 && !profile?.category && !profile?.legalType) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: resolved,
                    name: price.longName ?? price.shortName ?? null,
                    quoteType: price.quoteType ?? data.quoteType?.quoteType ?? null,
                    message:
                      "Bu sembol için ETF/fon içerik verisi bulunamadı. Sembolün bir ETF veya yatırım fonu olduğundan emin olun.",
                    source: "Yahoo Finance (topHoldings, fundProfile)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: resolved,
                  name: price.longName ?? price.shortName ?? null,
                  price: num(price.regularMarketPrice),
                  currency: price.currency ?? null,
                  exchange: price.exchangeName ?? null,
                  quoteType: price.quoteType ?? data.quoteType?.quoteType ?? "ETF",
                  profile: profile
                    ? {
                        category: profile.category,
                        legalType: profile.legalType,
                        family: profile.family,
                        netExpenseRatioPct: round(profile.netExpenseRatioPct, 4),
                        annualHoldingsTurnoverPct: round(profile.annualHoldingsTurnoverPct),
                      }
                    : null,
                  trailingReturns: returns
                    ? {
                        ytdPct: round(returns.ytdPct),
                        oneMonthPct: round(returns.oneMonthPct),
                        threeMonthPct: round(returns.threeMonthPct),
                        oneYearPct: round(returns.oneYearPct),
                        threeYearPct: round(returns.threeYearPct),
                        fiveYearPct: round(returns.fiveYearPct),
                        tenYearPct: round(returns.tenYearPct),
                      }
                    : null,
                  topHoldings: holdings.map((h) => ({
                    ...h,
                    weightPct: round(h.weightPct),
                  })),
                  sectorWeights: sectors.map((s) => ({
                    sector: s.sector,
                    weightPct: round(s.weightPct),
                  })),
                  source: "Yahoo Finance (topHoldings, fundProfile, fundPerformance)",
                  dataNote:
                    "ETF içerikleri periyodik güncellenir ve gecikmeli olabilir; gider oranı yıllıktır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`ETF/fon içeriği alınamadı (${upper}): ${msg}`);
      }
    }
  );
}

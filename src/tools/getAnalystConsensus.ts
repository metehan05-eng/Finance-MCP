import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuoteSummary, fetchQuote, tryBoth } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface ConsensusRow {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  bullishPercent: number | null;
}

/** Analist tavsiye dağılımından toplam ve yükseliş yüzdesi hesaplar. */
export function summarizeConsensus(trend: Array<Record<string, any>>): ConsensusRow[] {
  return trend.map((t) => {
    const strongBuy = Number(t.strongBuy ?? 0);
    const buy = Number(t.buy ?? 0);
    const hold = Number(t.hold ?? 0);
    const sell = Number(t.sell ?? 0);
    const strongSell = Number(t.strongSell ?? 0);
    const total = strongBuy + buy + hold + sell + strongSell;
    const bullish = strongBuy + buy;
    return {
      period: String(t.period ?? ""),
      strongBuy,
      buy,
      hold,
      sell,
      strongSell,
      total,
      bullishPercent: total > 0 ? round((bullish / total) * 100) : null,
    };
  });
}

/** Yükseliş yüzdesine göle genel eğilim yorumu. */
export function consensusLabel(row: ConsensusRow | undefined): string | null {
  if (!row || row.bullishPercent === null) return null;
  if (row.bullishPercent >= 80) return "güçlü alış konsensüsü";
  if (row.bullishPercent >= 60) return "alış ağırlıklı";
  if (row.bullishPercent >= 45) return "kararsız / nötr";
  if (row.bullishPercent >= 25) return "satış ağırlıklı";
  return "güçlü satış konsensüsü";
}

/**
 * Analist konsensüsü ve tavsiye trendi (BIST dahil).
 */
export function registerGetAnalystConsensus(server: McpServer) {
  server.tool(
    "get_analyst_consensus",
    "Bir hisse için analist konsensüsünü döndürür: güçlü alış/alış/tut/satış sayıları, yükseliş yüzdesi, son 6 dönemin değişimi ve ortalama hedef fiyat. BIST hisselerinde de Türkçe aracı kurumlar tarafından verilen veriler yer alır.",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO.IS, GARAN.IS, AAPL, NVDA)"),
    },
    async ({ symbol }) => {
      try {
        const upper = symbol.trim().toUpperCase();
        let resolved = upper;
        try {
          const chart = await tryBoth(upper, "1mo", "1d");
          resolved = chart.symbol;
        } catch {
          /* çözülemezse devam */
        }

        const [summary, quote] = await Promise.all([
          fetchQuoteSummary(resolved, ["recommendationTrend", "financialData"]).catch(() => ({})),
          fetchQuote(resolved).catch(() => null),
        ]);

        const trendRaw: Array<Record<string, any>> =
          (summary as any)?.recommendationTrend?.trend ?? [];
        const trend = summarizeConsensus(trendRaw);

        if (trend.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: resolved.replace(/\.IS$/i, ""),
                    currentPrice: round(quote?.regularMarketPrice),
                    currency: quote?.currency ?? null,
                    message:
                      "Bu sembol için analist tavsiye verisi bulunamadı (küçük/özel şirketlerde veya veri sağlanmayan borsalarda olağandır).",
                    source: "Yahoo Finance (recommendationTrend)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // '0m' = içinde bulunulan dönem, '-1m' = bir önceki dönem
        const current = trend.find((t) => t.period === "0m") ?? trend[0];
        const previous = trend.find((t) => t.period === "-1m") ?? trend[1] ?? null;

        const fin: any = (summary as any)?.financialData ?? {};
        const currentPrice = quote?.regularMarketPrice ?? fin.currentPrice ?? null;

        // Hedef fiyatlar
        const targets = {
          mean: fin.targetMeanPrice ?? null,
          low: fin.targetLowPrice ?? null,
          high: fin.targetHighPrice ?? null,
          median: fin.targetMedianPrice ?? null,
          analystCount: fin.numberOfAnalystOpinions ?? null,
        };

        const upside =
          targets.mean !== null && currentPrice !== null && currentPrice > 0
            ? round((targets.mean / currentPrice - 1) * 100)
            : null;

        const bullishChange =
          previous && current?.bullishPercent !== null && previous?.bullishPercent !== null
            ? round((current.bullishPercent as number) - (previous.bullishPercent as number))
            : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: resolved.replace(/\.IS$/i, ""),
                  currency: quote?.currency ?? null,
                  currentPrice: round(currentPrice),
                  consensus: {
                    ...current,
                    label: consensusLabel(current),
                  },
                  momentum:
                    bullishChange === null
                      ? null
                      : bullishChange > 0
                        ? "yükseliş yönünde artıyor"
                        : bullishChange < 0
                          ? "yükseliş yönünde zayıflıyor"
                          : "değişmedi",
                  bullishPercentChange: bullishChange,
                  priceTargets: {
                    mean: round(targets.mean),
                    median: round(targets.median),
                    low: round(targets.low),
                    high: round(targets.high),
                    analystCount: targets.analystCount,
                    upsidePercent: upside,
                  },
                  recommendationKey: fin.recommendationKey ?? null,
                  history: trend,
                  source: "Yahoo Finance (recommendationTrend, financialData)",
                  dataNote:
                    "Analist sayıları az olduğunda tek bir tavsiye oranı belirleyici olmayabilir. Hedef fiyatlar geçmiş performansa dayanır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Analist konsensüsü alınamadı: ${msg}`);
      }
    }
  );
}

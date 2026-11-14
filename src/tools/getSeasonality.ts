import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { tryBoth } from "../utils/yahoo.js";
import { mean, percentile, round } from "../utils/financeMath.js";

export const MONTH_LABELS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

export interface MonthlyClose {
  /** YYYY-MM */
  month: string;
  close: number;
}

export interface MonthStat {
  month: number;
  label: string;
  /** Kaç yıl için bu aya ait getiri hesaplandı. */
  years: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  positiveRatePct: number | null;
  bestPct: number | null;
  worstPct: number | null;
}

/**
 * Günlük OHLC satırlarından her takvim ayının son kapanışını çıkarır.
 * Satırlar tarihe göre sıralanır; aynı ayda birden fazla gün varsa sonuncusu kazanır.
 */
export function aggregateMonthlyCloses(
  rows: Array<{ date: string; close: number | null }>
): MonthlyClose[] {
  const sorted = [...rows]
    .filter((r) => r.close !== null && Number.isFinite(r.close))
    .sort((a, b) => a.date.localeCompare(b.date));

  const map = new Map<string, number>();
  for (const row of sorted) {
    map.set(row.date.slice(0, 7), row.close as number);
  }

  return [...map.entries()]
    .map(([month, close]) => ({ month, close }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Aylık kapanışlardan takvim ayı bazlı sezonluk istatistik üretir.
 * Yalnızca birbirini takip eden aylar arasında getiri hesaplanır; veri boşluğu
 * varsa o çift atlanır (yanlış aya yazılmasını önler).
 */
export function computeSeasonality(monthly: MonthlyClose[]): MonthStat[] {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i - 1];
    const cur = monthly[i];
    const prevMonth = Number(prev.month.slice(5, 7));
    const curMonth = Number(cur.month.slice(5, 7));
    const prevYear = Number(prev.month.slice(0, 4));
    const curYear = Number(cur.month.slice(0, 4));

    if (curYear * 12 + curMonth - (prevYear * 12 + prevMonth) !== 1) continue;
    if (!(prev.close > 0)) continue;

    const r = cur.close / prev.close - 1;
    if (Number.isFinite(r)) buckets[curMonth - 1].push(r);
  }

  return MONTH_LABELS_TR.map((label, idx) => {
    const xs = buckets[idx];
    if (xs.length === 0) {
      return {
        month: idx + 1,
        label,
        years: 0,
        avgReturnPct: null,
        medianReturnPct: null,
        positiveRatePct: null,
        bestPct: null,
        worstPct: null,
      };
    }
    return {
      month: idx + 1,
      label,
      years: xs.length,
      avgReturnPct: mean(xs) * 100,
      medianReturnPct: percentile(xs, 0.5) * 100,
      positiveRatePct: (xs.filter((x) => x > 0).length / xs.length) * 100,
      bestPct: Math.max(...xs) * 100,
      worstPct: Math.min(...xs) * 100,
    };
  });
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface SeasonalityDeps {
  tryBoth: typeof tryBoth;
}

export const DEFAULT_SEASONALITY_DEPS: SeasonalityDeps = { tryBoth };

/**
 * Bir varlığın ay bazlı mevsimsellik (seasonality) tablosunu üretir.
 */
export function registerGetSeasonality(
  server: McpServer,
  deps: SeasonalityDeps = DEFAULT_SEASONALITY_DEPS
) {
  server.tool(
    "get_seasonality",
    "Bir varlığın takvim ayı bazlı mevsimsel performansını gösterir: her ayın ortalama/medyan getirisi, pozitif kapanma oranı, en iyi/en kötü yıl. Örn: THYAO.IS, AAPL, XU100.IS.",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO.IS, AAPL, XU100.IS, BTC-USD)"),
      years: z
        .number()
        .int()
        .min(1)
        .max(15)
        .default(10)
        .describe("Kaç yıllık geçmiş analiz edilsin (1-15)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, years }) => {
      const upper = symbol.trim().toUpperCase();
      const startYear = new Date().getFullYear() - years;
      const startDate = `${startYear}-01-01`;

      try {
        const chart = await deps.tryBoth(upper, "max", "1d", startDate);
        const monthly = aggregateMonthlyCloses(chart.rows);

        if (monthly.length < 13) {
          return errorResponse(
            `'${upper}' için yeterli aylık veri yok (${monthly.length} ay). Daha uzun bir geçmiş deneyin.`
          );
        }

        const stats = computeSeasonality(monthly);
        const withData = stats.filter((s) => s.years > 0);
        if (withData.length === 0) {
          return errorResponse(
            `'${upper}' için birbirini takip eden aylık veri bulunamadı; mevsimsellik hesaplanamadı.`
          );
        }
        const best = withData.reduce((a, b) =>
          (b.avgReturnPct as number) > (a.avgReturnPct as number) ? b : a
        );
        const worst = withData.reduce((a, b) =>
          (b.avgReturnPct as number) < (a.avgReturnPct as number) ? b : a
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: chart.symbol.replace(/\.IS$/i, ""),
                  currency: chart.currency,
                  requestedYears: years,
                  monthlyObservations: monthly.length,
                  startMonth: monthly[0].month,
                  endMonth: monthly[monthly.length - 1].month,
                  bestMonth: {
                    month: best.label,
                    avgReturnPct: round(best.avgReturnPct),
                    years: best.years,
                  },
                  worstMonth: {
                    month: worst.label,
                    avgReturnPct: round(worst.avgReturnPct),
                    years: worst.years,
                  },
                  months: stats.map((s) => ({
                    month: s.label,
                    years: s.years,
                    avgReturnPct: round(s.avgReturnPct),
                    medianReturnPct: round(s.medianReturnPct),
                    positiveRatePct: round(s.positiveRatePct),
                    bestPct: round(s.bestPct),
                    worstPct: round(s.worstPct),
                  })),
                  source: "Yahoo Finance OHLC + yerel hesaplama",
                  dataNote:
                    "Mevsimsellik geçmiş eğilimdir; az sayıda yıl istatistiksel olarak zayıftır ve gelecek getiriyi garanti etmez. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Mevsimsellik analizi yapılamadı (${upper}): ${msg}`);
      }
    }
  );
}

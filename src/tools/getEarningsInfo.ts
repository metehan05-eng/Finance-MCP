import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuoteSummary, fetchQuote, tryBoth } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Yahoo'nun farklı borsalarda döndürdüğü tarih biçimlerini normalize eder.
 * - ISO string: "2026-10-29T20:00:00.000Z"
 * - { raw, fmt } nesnesi
 * - saniye/ms sayısal zaman damgası
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const raw = (value as any).raw ?? (value as any).fmt;
    return normalizeDate(raw);
  }

  if (typeof value === "number") {
    // saniye mi ms mi ayırt et
    const ms = value > 1e11 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

/**
 * Yaklaşan/son bilanço tarihi ve analist beklentileri.
 */
export function registerGetEarningsInfo(server: McpServer) {
  server.tool(
    "get_earnings_info",
    "Bir hissenin yaklaşan bilanço (kazanç) tarihini ve analist beklentilerini döndürür: tahmini EPS aralığı, tahmini ciro, son bilanço tarihi ve beklentiye göre EPS büyümesi. BIST ve ABD hisseleri için çalışır.",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO.IS, AAPL, NVDA, MSFT)"),
    },
    async ({ symbol }) => {
      try {
        const upper = symbol.trim().toUpperCase();

        // BIST uzantısını dene
        let resolved = upper;
        try {
          const chart = await tryBoth(upper, "1mo", "1d");
          resolved = chart.symbol;
        } catch {
          /* sembol çözülemezse as ise devam et */
        }

        const [summary, quote] = await Promise.all([
          fetchQuoteSummary(resolved, ["calendarEvents"]).catch(() => ({})),
          fetchQuote(resolved).catch(() => null),
        ]);

        const cal: any = (summary as any)?.calendarEvents ?? {};
        const earnings: any = cal?.earnings ?? {};

        const earningsDates = ((earnings.earningsDate ?? []) as unknown[])
          .map(normalizeDate)
          .filter((d): d is string => d !== null)
          .sort();

        const callDates = ((earnings.earningsCallDate ?? []) as unknown[])
          .map(normalizeDate)
          .filter((d): d is string => d !== null)
          .sort();

        if (earningsDates.length === 0 && callDates.length === 0) {
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
                      "Bu sembol için bilanço tarihi verisi bulunamadı. Bilanço tarihi yayınlanmamış olabilir veya kaynak desteklemiyor olabilir.",
                    source: "Yahoo Finance (calendarEvents)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const next = earningsDates.find((d) => new Date(d).getTime() >= Date.now()) ?? null;
        const epsAvg = earnings.earningsAverage ?? null;
        const epsLow = earnings.earningsLow ?? null;
        const epsHigh = earnings.earningsHigh ?? null;

        const daysUntil = next
          ? Math.round((new Date(next).getTime() - Date.now()) / 86_400_000)
          : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: resolved.replace(/\.IS$/i, ""),
                  currentPrice: round(quote?.regularMarketPrice),
                  currency: quote?.currency ?? null,
                  nextEarningsDate: next,
                  daysUntilEarnings: daysUntil,
                  earningsDates,
                  earningsCallDates: callDates,
                  estimate: {
                    epsAverage: round(epsAvg),
                    epsLow: round(epsLow),
                    epsHigh: round(epsHigh),
                    revenueAverage: round(earnings.revenueAverage),
                    revenueLow: round(earnings.revenueLow),
                    revenueHigh: round(earnings.revenueHigh),
                    numberOfEstimates: earnings.numberOfEstimates ?? null,
                    currency: earnings.currency ?? quote?.currency ?? null,
                    growthEstimate: earnings.growth ?? null,
                  },
                  isEstimate: earnings.isEarningsDateEstimate ?? null,
                  fiscalYearEnd: earnings.fiscalDateEnd ?? null,
                  source: "Yahoo Finance (calendarEvents)",
                  dataNote:
                    "Tarihler analist tahminidir ve şirket tarafından teyit edilene kadar değişebilir. Beklentilerin karşılanıp karşılanmaması getiriyi etkiler; yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Bilanço bilgisi alınamadı: ${msg}`);
      }
    }
  );
}

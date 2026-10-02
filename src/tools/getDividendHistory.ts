import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { tryBoth, fetchQuote } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface DividendPayment {
  date: string;
  amount: number;
}

export interface DividendYear {
  year: number;
  total: number;
  payments: number;
}

/** Temettü ödemelerini yıllara göre gruplar (en yeni yıl önce). */
export function groupDividendsByYear(payments: DividendPayment[]): DividendYear[] {
  const map = new Map<number, DividendYear>();
  for (const p of payments) {
    const year = Number(p.date.slice(0, 4));
    const entry = map.get(year) ?? { year, total: 0, payments: 0 };
    entry.total += p.amount;
    entry.payments += 1;
    map.set(year, entry);
  }
  return [...map.values()]
    .map((y) => ({ ...y, total: round(y.total) as number }))
    .sort((a, b) => b.year - a.year);
}

/** Temettü verimi: son 12 aydaki toplam temettü / güncel fiyat. */
export function trailingDividendYield(
  payments: DividendPayment[],
  price: number | null
): number | null {
  if (price === null || price <= 0) return null;
  const cutoff = Date.now() - 365 * 86_400_000;
  const sum = payments
    .filter((p) => new Date(p.date).getTime() >= cutoff)
    .reduce((a, b) => a + b.amount, 0);
  if (sum === 0) return null;
  return round((sum / price) * 100);
}

/**
 * Temettü geçmişi ve verim analizi (BIST ve global hisseler).
 */
export function registerGetDividendHistory(server: McpServer) {
  server.tool(
    "get_dividend_history",
    "Bir hissenin temettü (kâr payı) geçmişini, yıllık toplamlarını ve son 12 aylık temettü verimini döndürür. BIST dahil tüm borsaları destekler. Örn: THYAO.IS, GARAN.IS, AAPL, KO.",
    {
      symbol: z.string().min(1).describe("Sembol (THYAO.IS, GARAN.IS, AAPL, KO)"),
      years: z
        .number()
        .int()
        .min(1)
        .max(15)
        .default(5)
        .describe("Kaç yıllık geçmiş gösterilsin (1-15)"),
      includeSplits: z
        .boolean()
        .default(false)
        .describe("Pay biçiminde bölünme (split) kayıtları da dahil edilsin mi"),
    },
    async ({ symbol, years, includeSplits }) => {
      try {
        const upper = symbol.trim().toUpperCase();
        const startDate = `${new Date().getFullYear() - years}-01-01`;

        const chart = await tryBoth(upper, "5y", "1d", startDate);
        const events = chart.events?.dividends ?? [];

        if (events.length === 0) {
          const price = await fetchQuote(chart.symbol).catch(() => null);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: chart.symbol.replace(/\.IS$/i, ""),
                    currency: chart.currency,
                    currentPrice: round(price?.regularMarketPrice),
                    dividendCount: 0,
                    yearly: [],
                    trailing12mDividendYield: null,
                    message: `Bu sembol için son ${years} yılda temettü kaydı bulunamadı.`,
                    source: "Yahoo Finance (chart events)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const payments: DividendPayment[] = events
          .map((d) => ({
            date: d.date instanceof Date ? d.date.toISOString() : new Date(d.date).toISOString(),
            amount: Number(d.amount),
          }))
          .filter((p) => !isNaN(p.amount) && p.amount > 0)
          .sort((a, b) => b.date.localeCompare(a.date));

        const quote = await fetchQuote(chart.symbol).catch(() => null);
        const price = quote?.regularMarketPrice ?? null;
        const yield12m = trailingDividendYield(payments, price);
        const yearly = groupDividendsByYear(payments);

        // Süreklilik: kaç yılda temettü ödendiği
        const consistentYears = yearly.length;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: chart.symbol.replace(/\.IS$/i, ""),
                  currency: chart.currency,
                  currentPrice: round(price),
                  dividendCount: payments.length,
                  trailing12mDividendYield: yield12m,
                  averageAnnualDividend: yearly.length
                    ? round(
                        yearly.slice(0, 3).reduce((a, b) => a + (b.total ?? 0), 0) /
                          Math.min(3, yearly.length)
                      )
                    : null,
                  consistency: {
                    yearsWithDividend: consistentYears,
                    note:
                      consistentYears >= 3
                        ? "Düzenli temettü geçmişi (süreklilik iyi)."
                        : consistentYears === 2
                          ? "Sınırlı geçmiş — temettü politikası yeni olabilir veya kesintiye uğramış olabilir."
                          : "Tek seferlik veya seyrek temettü.",
                  },
                  yearly,
                  payments,
                  splits: includeSplits
                    ? (chart.events?.splits ?? []).map((s) => ({
                        date:
                          s.date instanceof Date
                            ? s.date.toISOString()
                            : new Date(s.date).toISOString(),
                        ratio: s.splitRatio ?? `${s.numerator}/${s.denominator}`,
                      }))
                    : null,
                  source: "Yahoo Finance (chart events)",
                  dataNote:
                    "Temettüler brüt tutardır; stopaj ve çeşitli vergiler düşülmemiştir. Geçmiş veriler gelecek ödemeleri garanti etmez. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `Temettü geçmişi alınamadı: ${msg}. Sembolü kontrol edin (THYAO.IS, AAPL).`
        );
      }
    }
  );
}

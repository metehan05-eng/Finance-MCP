import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchOhlc } from "../utils/yahoo.js";
import {
  correlation,
  mean,
  priceToReturns,
  alignByDate,
  annualizedReturn,
  annualizedVolatility,
  round,
} from "../utils/financeMath.js";

/**
 * İki varlık arasındaki fiyat korelasyonunu (Pearson) hesaplar.
 */
export function registerGetCorrelation(server: McpServer) {
  server.tool(
    "get_correlation",
    "İki varlığın (hisse, endeks, kripto veya para birimi) fiyat korelasyonunu ve getiri istatistiklerini hesaplar. Portföy çeşitlendirme / bağımlılık analizi için kullanılır. Örn: (THYAO.IS, BIST100) veya (BTC-USD, XU100.IS).",
    {
      symbolA: z
        .string()
        .min(1)
        .describe("Birinci varlık sembolü. BIST için '.IS' eklenir (THYAO.IS, XU100.IS)."),
      symbolB: z
        .string()
        .min(1)
        .describe("İkinci varlık sembolü. BIST için '.IS' eklenir (ASELS.IS, XU100.IS, BTC-USD)."),
      period: z
        .enum(["1mo", "3mo", "6mo", "1y", "2y", "5y"])
        .default("1y")
        .describe("Korelasyonun hesaplanacağı tarih aralığı"),
      interval: z
        .enum(["1d", "1wk", "1mo"])
        .default("1d")
        .describe("Getiri periyodu: günlük, haftalık veya aylık"),
    },
    async ({ symbolA, symbolB, period, interval }) => {
      const a = symbolA.trim().toUpperCase();
      const b = symbolB.trim().toUpperCase();

      try {
        const [resA, resB] = await Promise.all([
          fetchOhlc(a, { period, interval }),
          fetchOhlc(b, { period, interval }),
        ]);

        const pA = resA.rows.filter((r) => r.close !== null).map((r) => ({ date: r.date.slice(0, 10), close: r.close as number }));
        const pB = resB.rows.filter((r) => r.close !== null).map((r) => ({ date: r.date.slice(0, 10), close: r.close as number }));

        if (pA.length < 5 || pB.length < 5) {
          return errorResponse(
            `Yeterli ortak veri yok: '${a}' ${pA.length} nokta, '${b}' ${pB.length} nokta. Aralığı büyütün.`
          );
        }

        const { xs, ys } = alignByDate(pA, pB);
        if (xs.length < 5) {
          return errorResponse("İki varlığın tarihleri yeterince örtüşmüyor. Sonuçlar anlamsız olur.");
        }

        const rA = priceToReturns(xs);
        const rB = priceToReturns(ys);
        const corr = correlation(rA, rB);
        const cov = rA
          .map((v, i) => (v - mean(rA)) * (rB[i] - mean(rB)))
          .reduce((s, v) => s + v, 0) / (rA.length - 1);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbolA: a,
                  symbolB: b,
                  currencyA: resA.currency,
                  currencyB: resB.currency,
                  period,
                  interval,
                  dataPoints: xs.length,
                  correlation: round(corr, 4),
                  covariance: round(cov, 6),
                  interpretation: interpretCorrelation(corr),
                  statsA: {
                    annReturnPct: round(annualizedReturn(rA) * 100),
                    annVolPct: round(annualizedVolatility(rA) * 100),
                    returns: rA.length,
                    firstClose: round(xs[0], 2),
                    lastClose: round(xs[xs.length - 1], 2),
                  },
                  statsB: {
                    annReturnPct: round(annualizedReturn(rB) * 100),
                    annVolPct: round(annualizedVolatility(rB) * 100),
                    returns: rB.length,
                    firstClose: round(ys[0], 2),
                    lastClose: round(ys[ys.length - 1], 2),
                  },
                  source: "Yahoo Finance",
                  dataNote: "Korelasyon -1 ile +1 arasındadır; +1 birlikte hareket eder, -1 ters hareket eder.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Korelasyon hesaplanamadı: ${msg}`);
      }
    }
  );
}

function interpretCorrelation(c: number): string {
  const abs = Math.abs(c);
  if (abs >= 0.9) return c > 0 ? "Çok güçlü pozitif korelasyon — varlıklar birlikte hareket ediyor." : "Çok güçlü negatif korelasyon — varlıklar ters hareket ediyor.";
  if (abs >= 0.7) return c > 0 ? "Güçlü pozitif korelasyon." : "Güçlü negatif korelasyon.";
  if (abs >= 0.5) return c > 0 ? "Orta pozitif korelasyon." : "Orta negatif korelasyon.";
  if (abs >= 0.3) return c > 0 ? "Zayıf pozitif korelasyon." : "Zayıf negatif korelasyon.";
  return "Korelasyon yok / önemsiz — varlıklar bağımsız hareket ediyor (çeşitlendirme iyi).";
}
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { getYahoo } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Yahoo quoteSummary modülleri. Alan adları yahoo-finance2 v4 gerçek
 * cevabına göre eşlenir (raw/fmt nesneleri yoktur, plain number gelir).
 */
const SUMMARY_MODULES = [
  "defaultKeyStatistics",
  "financialData",
  "assetProfile",
  "summaryDetail",
  "price",
] as string[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => (v == null ? null : v);

/**
 * Bir hissenin temel finansal göstergelerini (F/K, EPS, temettü, PD/DD,
 * marjlar, büyüme, beta vs.) döndürür.
 */
export function registerGetFundamentals(server: McpServer) {
  server.tool(
    "get_fundamentals",
    "Bir hisse senedinin temel (fundamental) analiz göstergelerini döndürür: F/K oranı, EPS, PD/DD, temettü verimi, marjlar, büyüme oranları, beta, şirket profili, analist hedefleri. BIST ve küresel hisseler desteklenir.",
    {
      symbol: z
        .string()
        .min(1)
        .describe(
          "Sembol. BIST için koda '.IS' ekleyin: 'THYAO.IS', 'ASELS.IS'. Küresel: 'AAPL', 'NVDA'."
        ),
    },
    async ({ symbol }) => {
      const ticker = symbol.trim().toUpperCase();

      try {
        const yf = await getYahoo();

        // Yahoo v4 bazen geçici ağ hatası verir; bir kez daha dene
        let result: any;
        try {
          result = await yf.quoteSummary(ticker, { modules: SUMMARY_MODULES });
        } catch {
          result = await yf.quoteSummary(ticker, { modules: SUMMARY_MODULES });
        }

        const k = result?.defaultKeyStatistics ?? {};
        const fd = result?.financialData ?? {};
        const ap = result?.assetProfile ?? {};
        const sd = result?.summaryDetail ?? {};
        const pr = result?.price ?? {};

        const marketCap = num(sd.marketCap) ?? num(fd.marketCap);
        const freeCashflow = num(fd.freeCashflow);

        const fundamentals = {
          symbol: ticker,
          company: {
            name: pr.longName ?? pr.shortName ?? null,
            sector: ap.sector ?? null,
            industry: ap.industry ?? null,
            country: ap.country ?? null,
            website: ap.website ?? null,
            employees: ap.fullTimeEmployees ?? null,
            summary: ap.longBusinessSummary ?? null,
          },
          valuations: {
            trailingPE: round(num(sd.trailingPE) ?? num(k.trailingPE)),
            forwardPE: round(num(k.forwardPE) ?? num(sd.forwardPE)),
            priceToBook: round(num(k.priceToBook)),
            priceToSales: fd.currentPrice && fd.totalRevenue ? round(fd.currentPrice * (num(k.sharesOutstanding) ?? 0) / fd.totalRevenue) : null,
            priceToFreeCashFlow: marketCap && freeCashflow ? round(marketCap / freeCashflow) : null,
            enterpriseValue: num(k.enterpriseValue) ?? num(fd.enterpriseValue),
          },
          performance: {
            returnOnEquity: round(num(fd.returnOnEquity) != null ? num(fd.returnOnEquity) * 100 : null),
            returnOnAssets: round(num(fd.returnOnAssets) != null ? num(fd.returnOnAssets) * 100 : null),
            profitMargin: round(num(fd.profitMargins) != null ? num(fd.profitMargins) * 100 : null),
            operatingMargin: round(num(fd.operatingMargins) != null ? num(fd.operatingMargins) * 100 : null),
            grossMargin: round(num(fd.grossMargins) != null ? num(fd.grossMargins) * 100 : null),
            eps: num(k.trailingEps),
            forwardEps: num(k.forwardEps),
            beta: round(num(sd.beta) ?? num(k.beta)),
          },
          growth: {
            revenueGrowth: round(num(fd.revenueGrowth) != null ? num(fd.revenueGrowth) * 100 : null),
            earningsGrowth: round(num(fd.earningsGrowth) != null ? num(fd.earningsGrowth) * 100 : null),
            earningsQuarterlyGrowth: round(num(k.earningsQuarterlyGrowth) != null ? num(k.earningsQuarterlyGrowth) * 100 : null),
          },
          dividend: {
            yieldPct: round(num(sd.dividendYield) != null ? num(sd.dividendYield) * 100 : null),
            rate: num(sd.dividendRate),
            payoutRatioPct: round(num(sd.payoutRatio) != null ? num(sd.payoutRatio) * 100 : null),
            exDate: num(sd.exDividendDate) ?? null,
            isDividendPayer: !!sd.dividendYield || !!sd.dividendRate,
          },
          liquidity: {
            marketCap: marketCap,
            sharesOutstanding: num(k.sharesOutstanding) ?? num(fd.sharesOutstanding),
            freeFloat: num(k.floatShares),
            pegRatio: round(num(k.pegRatio)),
            debtToEquity: round(num(fd.debtToEquity) ?? num(k.debtToEquity)),
            currentRatio: round(num(fd.currentRatio) ?? num(k.currentRatio)),
            quickRatio: round(num(fd.quickRatio) ?? num(k.quickRatio)),
            totalDebt: num(fd.totalDebt) ?? num(k.totalDebt),
            totalCash: num(fd.totalCash) ?? num(k.totalCash),
            freeCashflow: freeCashflow,
          },
          analystOpinion: {
            currentPrice: num(fd.currentPrice),
            targetMean: num(fd.targetMeanPrice),
            targetHigh: num(fd.targetHighPrice),
            targetLow: num(fd.targetLowPrice),
            recommendation: num(fd.recommendationKey),
            numberOfAnalysts: num(fd.numberOfAnalystOpinions),
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ...fundamentals, source: "Yahoo Finance", dataNote: "Yatırım tavsiyesi değildir. BIST hisselerinde bazı kalemler boş olabilir." },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `'${ticker}' için temel veriler alınamadı: ${msg}. Sembolü kontrol edin (THYAO.IS, AAPL) veya geçici ağ hatası olabilir.`
        );
      }
    }
  );
}
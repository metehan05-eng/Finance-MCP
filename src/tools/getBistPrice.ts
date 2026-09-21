import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";

export function registerGetBistPrice(server: McpServer) {
  server.tool(
    "get_bist_price",
    "Borsa İstanbul (BIST) hisse senedinin güncel fiyatını, değişimini ve piyasa verilerini döndürür. Veri Yahoo Finance üzerinden 15 dakika gecikmeli olarak sağlanır. Sembol olarak sadece hisse kodunu girin (ör. THYAO, GARAN, ASELS).",
    {
      symbol: z
        .string()
        .min(1)
        .describe(
          "BIST hisse kodu, ör. THYAO, GARAN, ASELS, SASA, BIMAS (sonuna .IS eklemeyin)"
        ),
    },
    async ({ symbol }) => {
      const ticker = symbol.toUpperCase().replace(/\.IS$/i, "");
      const query = `${ticker}.IS`;

      try {
        // yahoo-finance2 v4: default export is the YahooFinance class
        const { default: YahooFinance } = await import("yahoo-finance2");
        const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quote: any = await yf.quote(query);

        if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
          return errorResponse(
            `'${ticker}' için fiyat verisi alınamadı. BIST hisse kodu doğru mu? Ör: THYAO, GARAN, ASELS`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: ticker,
                  fullSymbol: query,
                  name: quote.longName ?? quote.shortName ?? ticker,
                  price: quote.regularMarketPrice,
                  currency: quote.currency ?? "TRY",
                  change: quote.regularMarketChange ?? null,
                  changePercent: quote.regularMarketChangePercent ?? null,
                  open: quote.regularMarketOpen ?? null,
                  high: quote.regularMarketDayHigh ?? null,
                  low: quote.regularMarketDayLow ?? null,
                  previousClose: quote.regularMarketPreviousClose ?? null,
                  volume: quote.regularMarketVolume ?? null,
                  marketCap: quote.marketCap ?? null,
                  fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
                  fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
                  marketState: quote.marketState ?? null,
                  source: "Yahoo Finance",
                  dataNote: "Veriler 15 dakika gecikmeli olabilir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.toLowerCase().includes("no fundamentals") ||
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("no data")
        ) {
          return errorResponse(
            `'${ticker}' bulunamadı. BIST hisse kodu doğru mu? Ör: THYAO, GARAN, ASELS, SASA`
          );
        }
        return errorResponse(`Veri alınamadı: ${msg}`);
      }
    }
  );
}

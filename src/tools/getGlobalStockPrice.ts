import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";

export function registerGetGlobalStockPrice(server: McpServer) {
  server.tool(
    "get_global_stock_price",
    "Dünya genelindeki tüm hisse senetlerinin, borsa endekslerinin (S&P 500, NASDAQ vb.) ve ETF'lerin anlık/güncel fiyat ve piyasa verilerini döndürür. (Örn: AAPL, NVDA, TSLA, MSFT, AMZN, SAP.DE, SHEL.L, ^GSPC, ^IXIC).",
    {
      symbol: z
        .string()
        .min(1)
        .describe(
          "Küresel hisse veya endeks sembolü (ör. AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, SAP.DE, ^GSPC)"
        ),
    },
    async ({ symbol }) => {
      const ticker = symbol.toUpperCase().trim();

      try {
        const { default: YahooFinance } = await import("yahoo-finance2");
        const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quote: any = await yf.quote(ticker);

        if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
          return errorResponse(
            `'${ticker}' için fiyat verisi alınamadı. Lütfen sembolün doğruluğunu kontrol edin (Örn: AAPL, NVDA, MSFT).`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: quote.symbol || ticker,
                  name: quote.longName ?? quote.shortName ?? ticker,
                  price: quote.regularMarketPrice,
                  currency: quote.currency ?? "USD",
                  exchange: quote.fullExchangeName || quote.exchange,
                  change: quote.regularMarketChange ?? null,
                  changePercent: quote.regularMarketChangePercent ?? null,
                  open: quote.regularMarketOpen ?? null,
                  high: quote.regularMarketDayHigh ?? null,
                  low: quote.regularMarketDayLow ?? null,
                  previousClose: quote.regularMarketPreviousClose ?? null,
                  volume: quote.regularMarketVolume ?? null,
                  marketCap: quote.marketCap ?? null,
                  peRatio: quote.trailingPE ?? null,
                  forwardPE: quote.forwardPE ?? null,
                  fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
                  fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
                  marketState: quote.marketState ?? null,
                  source: "Yahoo Finance (Global)",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`'${ticker}' verisi alınamadı: ${msg}`);
      }
    }
  );
}

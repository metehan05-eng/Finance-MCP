import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

const TROY_OUNCE_IN_GRAMS = 31.1034768;
const KARAT_22 = 22 / 24;
const KARAT_24 = 1;

/**
 * Altın fiyatı: uluslararası ons (USD) + gram karşılıkları (TRY).
 * Kaynak: Yahoo Finance altın vadeli işlem (GC=F) ve USD/TRY.
 */
export function registerGetAltinGramPrice(server: McpServer) {
  server.tool(
    "get_altin_gram_price",
    "Altın fiyatını uluslararası ons (USD) ve gram (TRY) karşılığıyla döndürür. 24 ayar ve 22 ayar (ziynet) gram fiyatı hesaplanır. Kaynak: Yahoo Finance (altın vadeli işlem + USD/TRY).",
    {
      karat: z
        .enum(["24", "22"])
        .default("24")
        .describe("Hangi ayar için gram fiyatı (24 = saf altın, 22 = ziynet altını)"),
    },
    async ({ karat }) => {
      try {
        const quotes = await fetchQuotes(["GC=F", "USDTRY=X"]);
        const bySymbol = new Map(
          quotes.filter((q: any) => q?.symbol).map((q: any) => [q.symbol, q])
        );

        const gold: any = bySymbol.get("GC=F");
        const usdTry: any = bySymbol.get("USDTRY=X");

        const ounceUsd = gold?.regularMarketPrice ?? null;
        const usdTryRate = usdTry?.regularMarketPrice ?? null;

        if (ounceUsd === null) {
          return errorResponse("Altın fiyatı alınamadı (GC=F).");
        }

        const gramUsd = ounceUsd / TROY_OUNCE_IN_GRAMS;
        const purity = karat === "22" ? KARAT_22 : KARAT_24;
        const gramUsdPure = gramUsd * purity;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ounceUsd: round(ounceUsd),
                  ounceChangePercent: round(gold?.regularMarketChangePercent),
                  gramUsd: round(gramUsdPure),
                  gramTry: usdTryRate !== null ? round(gramUsdPure * usdTryRate) : null,
                  karat,
                  usdTryRate: round(usdTryRate),
                  change: gold?.regularMarketChange ?? null,
                  currency: "USD (ons) / TRY (gram)",
                  source: "Yahoo Finance (GC=F altın vadeli işlem, USDTRY=X)",
                  dataNote:
                    "Gram fiyat saf altın üzerinden hesaplanır; ziynet altınında (22 ayar) %8,33 işçilik/zarar payı genelde eklenir. Ürün fiyatları bu değerden farklı olabilir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Altın fiyatı alınamadı: ${msg}`);
      }
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuote } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Yaygın emtiaların Yahoo Futures sembolleri.
 * GC=F (Altın), SI=F (Gümüş), CL=F (WTI), BZ=F (Brent), NG=F (Doğalgaz) vb.
 */
const COMMODITY_SYMBOLS: Record<string, string> = {
  altin: "GC=F",
  gold: "GC=F",
  gumus: "SI=F",
  silver: "SI=F",
  brent: "BZ=F",
  petrol: "CL=F",
  oil: "CL=F",
  wti: "CL=F",
  dogalgaz: "NG=F",
  "dogal gaz": "NG=F",
  naturalgas: "NG=F",
  "natural-gas": "NG=F",
  bakir: "HG=F",
  copper: "HG=F",
  platin: "PL=F",
  platinum: "PL=F",
  paladyum: "PA=F",
  palladium: "PA=F",
  bugday: "ZW=F",
  wheat: "ZW=F",
  misir: "ZC=F",
  corn: "ZC=F",
  pamuk: "CT=F",
  cotton: "CT=F",
  kahve: "KC=F",
  coffee: "KC=F",
  seker: "SB=F",
  sugar: "SB=F",
  "altin-gumus-orani": "XAUXAG",
};

const COMMODITY_DETAILS: Record<string, { name: string; unit: string }> = {
  "GC=F": { name: "Altın (COMEX)", unit: "ABD doları / ons" },
  "SI=F": { name: "Gümüş (COMEX)", unit: "ABD doları / ons" },
  "BZ=F": { name: "Brent Petrol", unit: "ABD doları / varil" },
  "CL=F": { name: "WTI Ham Petrol", unit: "ABD doları / varil" },
  "NG=F": { name: "Doğalgaz (Henry Hub)", unit: "ABD doları / MMBtu" },
  "HG=F": { name: "Bakır (COMEX)", unit: "ABD doları / libre" },
  "PL=F": { name: "Platin", unit: "ABD doları / ons" },
  "PA=F": { name: "Paladyum", unit: "ABD doları / ons" },
  "ZW=F": { name: "Buğday (SRW)", unit: "ABD doları / bushel" },
  "ZC=F": { name: "Mısır", unit: "ABD doları / bushel" },
  "CT=F": { name: "Pamuk", unit: "ABD doları / libre" },
  "KC=F": { name: "Kahve", unit: "ABD doları / libre" },
  "SB=F": { name: "Şeker", unit: "ABD doları / libre" },
};

export function registerGetCommodityPrice(server: McpServer) {
  server.tool(
    "get_commodity_price",
    "Emtia fiyatlarını döndürür: altın, gümüş, petrol (WTI/Brent), doğalgaz, bakır, platin, paladyum gibi. Türkçe adlarla veya doğrudan sembolle sorgulanabilir.",
    {
      commodity: z
        .string()
        .min(1)
        .describe(
          "Emtia adı (altin, gumus, brent, petrol, dogalgaz, bakir, platin, paladyum...) veya doğrudan Yahoo sembolü (GC=F, SI=F, CL=F, BZ=F, NG=F, HG=F)"
        ),
    },
    async ({ commodity }) => {
      const key = commodity.trim().toLowerCase().replace(/ı/g, "i").replace(/\s+/g, "");
      const symbol = COMMODITY_SYMBOLS[key] ?? commodity.trim().toUpperCase();

      try {
        const quote = await fetchQuote(symbol);

        if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
          return errorResponse(
            `'${commodity}' için fiyat bulunamadı. Desteklenen emtialar: altın, gümüş, brent, petrol, doğalgaz, bakır, platin, paladyum veya geçerli bir Yahoo futures sembolü (GC=F, SI=F...).`
          );
        }

        const detail = COMMODITY_DETAILS[symbol] ?? { name: quote.longName ?? quote.shortName ?? symbol, unit: null };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  commodity: detail.name,
                  symbol,
                  price: quote.regularMarketPrice,
                  unit: detail.unit ?? `${quote.currency ?? "USD"} bazlı`,
                  currency: quote.currency ?? "USD",
                  change: quote.regularMarketChange ?? null,
                  changePercent: round(quote.regularMarketChangePercent),
                  open: quote.regularMarketOpen ?? null,
                  high: quote.regularMarketDayHigh ?? null,
                  low: quote.regularMarketDayLow ?? null,
                  previousClose: quote.regularMarketPreviousClose ?? null,
                  marketState: quote.marketState ?? null,
                  source: "Yahoo Finance",
                  dataNote: "Futures kontrat fiyatlarıdır. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Emtia verisi alınamadı: ${msg}`);
      }
    }
  );
}
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { searchSymbols } from "../utils/yahoo.js";

/**
 * Herhangi bir varlığın (hisse, endeks, ETF, kripto, para birimi) sembol araması.
 */
export function registerSearchSymbol(server: McpServer) {
  server.tool(
    "search_symbol",
    "Borsada işlem gören bir varlığı sembolüne veya adına göre arayarak doğru ticker'ı bulmanıza yarar. BIST hisseleri, küresel hisseler, ETF'ler ve endeksler için uygundur. Örn: 'ASELSAN' → ASELS.IS, 'Tesla' → TSLA, 'BIST Banka' → XBANK.IS.",
    {
      query: z.string().min(1).describe("Aranacak isim veya sembol, örn. 'ASELSAN', 'THY', 'Tesla'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(8)
        .describe("Döndürülecek sonuç sayısı (default: 8)"),
    },
    async ({ query, limit }) => {
      try {
        const results = await searchSymbols(query, limit);

        if (!results || results.length === 0) {
          return errorResponse(
            `'${query}' için sonuç bulunamadı. Farklı bir isim veya sembol deneyin.`
          );
        }

        const items = results
          .filter((r: any) => r?.symbol)
          .slice(0, limit)
          .map((r: any) => ({
            symbol: r.symbol as string,
            name: r.shortname ?? r.longname ?? null,
            type: r.quoteType ?? r.typ ?? null,
            exchange: r.exchDisp ?? r.exchange ?? null,
            isBist: (r.exchange ?? "").toUpperCase() === "IST",
            exactMatch: String(r.symbol).toUpperCase() === query.toUpperCase(),
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  resultCount: items.length,
                  results: items,
                  tip: "BIST hisseleri sembolün sonuna '.IS' ekler (ASELS.IS). Küresel hisselerde doğrudan sembolü kullanın (AAPL).",
                  source: "Yahoo Finance",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Arama yapılamadı: ${msg}`);
      }
    }
  );
}
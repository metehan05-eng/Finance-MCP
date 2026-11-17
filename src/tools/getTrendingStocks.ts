import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { getYahoo, fetchQuotes, cachedYahooQuery } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Bölgesel olarak trend olan (en çok aranan/işlem gören) sembollerin
 * fiyat bilgisiyle birlikte listesi.
 *
 * Not: Yahoo'nun trending uç noktası bazı bölgelerde (örn. TR) şema hatası
 * verdiği için o durumda screener'ın 'most_actives' listesine düşülür.
 */
export function registerGetTrendingStocks(server: McpServer) {
  server.tool(
    "get_trending_stocks",
    "Belirli bir bölgede en çok trend olan / ilgi gören hisseleri fiyat ve değişim bilgisiyle döndürür. Örn: TR bölgesi için BIST hisseleri.",
    {
      region: z.string().length(2).default("TR").describe("Bölge kodu (TR, US, GB, DE, JP vb.)"),
      count: z.number().int().min(1).max(30).default(10).describe("Döndürülecek sembol sayısı"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ region, count }) => {
      try {
        const reg = region.toUpperCase();
        const { symbols, source, fallback } = await cachedYahooQuery(
          `trending:${reg}:${count}`,
          async () => {
            const yf = await getYahoo();
            let found: string[] = [];
            let resultSource = "Yahoo Finance Trending";
            let usedFallback = false;
            try {
              const trending = await yf.trendingSymbols(reg, { count });
              found = (trending?.quotes ?? [])
                .map((q: any) => q?.symbol)
                .filter((s: unknown): s is string => typeof s === "string");
            } catch {
              /* Bu bölge Yahoo trending tarafından desteklenmiyor olabilir. */
            }
            if (found.length === 0) {
              const screener = await yf.screener({ scrIds: "most_actives", count, region: reg });
              found = (screener?.quotes ?? [])
                .map((q: any) => q?.symbol)
                .filter((s: unknown): s is string => typeof s === "string");
              resultSource = "Yahoo Finance Screener (most_actives) — trending yedeği";
              usedFallback = true;
            }
            return { symbols: found.slice(0, count), source: resultSource, fallback: usedFallback };
          }
        );
        if (symbols.length === 0) {
          return errorResponse(`'${reg}' bölgesi için trend sembol bulunamadı.`);
        }

        // Fiyat bilgisi için toplu kotasyon (hata olsa bile semboller dönsün)
        let quotes: any[] = [];
        try {
          quotes = await fetchQuotes(symbols);
        } catch {
          quotes = [];
        }
        const bySymbol = new Map(
          quotes.filter((q: any) => q?.symbol).map((q: any) => [q.symbol, q])
        );

        const items = symbols.map((s) => {
          const q: any = bySymbol.get(s) ?? {};
          return {
            symbol: s.replace(/\.IS$/i, ""),
            rawSymbol: s,
            name: q.shortName ?? q.longName ?? null,
            price: q.regularMarketPrice ?? null,
            changePercent: round(q.regularMarketChangePercent),
            currency: q.currency ?? null,
            exchange: q.fullExchangeName ?? q.exchange ?? null,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  region: reg,
                  count: items.length,
                  items,
                  source,
                  fallback,
                  dataNote: fallback
                    ? "Bu bölge için Yahoo trend verisi yok; en aktif hisseler listelendi. Bölge filtresi tarayıcıda her zaman uygulanmayabilir."
                    : "Trend listesi arama ve işlem aktivitesine göre güncellenir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Trend semboller alınamadı: ${msg}`);
      }
    }
  );
}

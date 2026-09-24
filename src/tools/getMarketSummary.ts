import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

const WATCHLIST = {
  indices: ["XU100.IS", "XU030.IS", "XU050.IS"],
  banks: ["GARAN.IS", "ISCTR.IS", "AKBNK.IS", "YKBNK.IS", "TSKB.IS"],
  industrials: ["ASELS.IS", "THYAO.IS", "EREGL.IS", "PETKM.IS", "SAHOL.IS"],
  other: ["TUPRS.IS", "BIMAS.IS", "SISE.IS"],
};

const LABEL: Record<string, string> = {
  indices: "Endeksler",
  banks: "Bankacılık",
  industrials: "Sanayi & Hizmet",
  other: "Diğer Büyükler",
};

/**
 * BIST piyasa özeti: ana endeksler + en çok takip edilen hisselerin
 * anlık fiyat/değişim bilgileri.
 */
export function registerGetMarketSummary(server: McpServer) {
  server.tool(
    "get_market_summary",
    "Borsa İstanbul piyasa özeti: XU100/XU030/XU050 ana endekslerinin ve önemli hisselerin (banka, sanayi) anlık fiyat ve değişim bilgileri.",
    {},
    async () => {
      try {
        const all = [...WATCHLIST.indices, ...WATCHLIST.banks, ...WATCHLIST.industrials, ...WATCHLIST.other];

        // Parçalı çek — Yahoo tek çağrıda sınırlı sayıda sembol kabul eder
        const chunks: string[][] = [];
        for (let i = 0; i < all.length; i += 12) chunks.push(all.slice(i, i + 12));

        const results: any[] = [];
        for (const chunk of chunks) {
          try {
            const qs = await fetchQuotes(chunk);
            results.push(...qs);
          } catch {
            // tek çekim hatası tüm özeti düşürmesin
          }
        }

        const byGroup: Record<string, any[]> = {};
        for (const key of Object.keys(WATCHLIST)) {
          byGroup[key] = [];
        }

        for (const sym of all) {
          const q = results.find((r: any) => r?.symbol === sym);
          if (!q) continue;
          const group = Object.keys(WATCHLIST).find((g) => (WATCHLIST as any)[g].includes(sym))!;
          byGroup[group].push({
            symbol: (q.symbol as string).replace(/\.IS$/i, ""),
            name: q.shortName ?? q.longName ?? null,
            price: q.regularMarketPrice ?? null,
            change: q.regularMarketChange ?? null,
            changePercent: round(q.regularMarketChangePercent),
            volume: q.regularMarketVolume ?? null,
            currency: q.currency ?? "TRY",
          });
        }

        const sections = Object.entries(byGroup).map(([key, items]) => ({
          group: LABEL[key] ?? key,
          items,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  market: "Borsa İstanbul (BIST)",
                  asOf: new Date().toISOString(),
                  sections,
                  source: "Yahoo Finance",
                  dataNote:
                    "Anlık kotasyonların gergin olması sebebiyle bazı semboller eksik dönebilir. 15 dk gecikmeli olabilir. Yatırım tavsiyesi değildir.",
                  watchlistTip:
                    "Bu özet sabit bir liste kullanır; özel liste için get_bist_indices veya get_global_stock_price kullanın.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Piyasa özeti alınamadı: ${msg}`);
      }
    }
  );
}
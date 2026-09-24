import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

const DEFAULT_INDICES = ["XU100", "XU030", "XU050", "XU015", "XBANK", "XUSIN"];

const INDEX_NAMES: Record<string, string> = {
  XU100: "BIST 100",
  XU030: "BIST 30",
  XU050: "BIST 50",
  XU015: "BIST 15",
  XU010: "BIST TÜM",
  XUSIN: "BIST SINAİ",
  XBANK: "BIST BANKA",
  XMESM: "BIST MADENCİLİK",
  XUTEK: "BIST TEKNOLOJİ",
  XGMYO: "BIST GMYO",
  XKAGIT: "BIST KAĞIT",
  XILTM: "BIST İLETİŞİM",
};

/**
 * BIST endekslerinin anlık değerini (ve istenirse tüm endeks listesini) döndürür.
 */
export function registerGetBistIndices(server: McpServer) {
  server.tool(
    "get_bist_indices",
    "Borsa İstanbul (BIST) endekslerinin güncel değerini, değişimini ve işlem hacmini döndürür. Varsayılan: XU100, XU030, XU050, XU015, XBANK, XUSIN.",
    {
      indices: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe(
          "Endeks kodları listesi (örn. ['XU100','XU030','XBANK']). Verilmezse ana endeksler kullanılır."
        ),
    },
    async ({ indices }) => {
      const codes = (indices ?? []).map((c) => c.toUpperCase().replace(/\.IS$/i, ""));

      try {
        const quotes = await fetchQuotes(codes.map((c) => `${c}.IS`));

        const items = quotes
          .filter((q: any) => q?.symbol)
          .map((q: any) => {
            const code = String(q.symbol).replace(/\.IS$/i, "");
            return {
              index: code,
              name: INDEX_NAMES[code] ?? q.longName ?? q.shortName ?? code,
              value: q.regularMarketPrice ?? null,
              change: q.regularMarketChange ?? null,
              changePercent: round(q.regularMarketChangePercent),
              open: q.regularMarketOpen ?? null,
              dayHigh: q.regularMarketDayHigh ?? null,
              dayLow: q.regularMarketDayLow ?? null,
              previousClose: q.regularMarketPreviousClose ?? null,
              volume: q.regularMarketVolume ?? null,
              marketState: q.marketState ?? null,
            };
          });

        const withValue = items.filter((i: any) => i.value !== null);
        const avgChange =
          withValue.length > 0
            ? round(
                withValue.reduce((a: number, i: any) => a + (i.changePercent ?? 0), 0) /
                  withValue.length
              )
            : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  queriedIndices: items.length,
                  avgChangePercent: avgChange,
                  indices: items,
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
        return errorResponse(`Endeks verisi alınamadı: ${msg}`);
      }
    }
  );
}
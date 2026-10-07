import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuote } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";
import { loadWatchlist, watchlistPath } from "../utils/watchlistStore.js";

export interface WatchItem {
  symbol: string;
  name: string | null;
  price: number | null;
  dayChangePercent: number | null;
  week52ChangePercent: number | null;
  currency: string | null;
  distanceTo52High: number | null;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Tek kotasyondan izleme satırı üretir. */
export function buildWatchItem(symbol: string, q: Record<string, any> | undefined): WatchItem {
  const price = n(q?.regularMarketPrice);
  const high52 = n(q?.fiftyTwoWeekHigh);
  return {
    symbol,
    name: q?.longName ?? q?.shortName ?? null,
    price: price === null ? null : round(price),
    dayChangePercent:
      q?.regularMarketChangePercent === undefined ? null : round(q.regularMarketChangePercent),
    week52ChangePercent:
      n(q?.fiftyTwoWeekChangePercent) === null ? null : round(q?.fiftyTwoWeekChangePercent),
    currency: q?.currency ?? null,
    distanceTo52High:
      price !== null && high52 !== null && high52 > 0
        ? round(((price - high52) / high52) * 100)
        : null,
  };
}

/** İzleme listesini günlük performansa göre sıralar. */
export function rankByDay(items: WatchItem[]): WatchItem[] {
  return [...items].sort(
    (a, b) => (b.dayChangePercent ?? -Infinity) - (a.dayChangePercent ?? -Infinity)
  );
}

/**
 * İzleme listesi: birden fazla sembolün anlık durumu, en yükselen/düşen özeti.
 */
/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface WatchlistDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuote: typeof fetchQuote;
  load?: typeof loadWatchlist;
  path?: typeof watchlistPath;
}

export const DEFAULT_WATCHLIST_DEPS: WatchlistDeps = {
  resolveTickers,
  fetchQuote,
  load: loadWatchlist,
  path: watchlistPath,
};

export function registerGetWatchlist(
  server: McpServer,
  deps: WatchlistDeps = DEFAULT_WATCHLIST_DEPS
) {
  server.tool(
    "get_watchlist",
    "Takip edilen sembollerin anlık durumunu tek tabloda gösterir: fiyat, günlük ve 52 haftalık değişim, 52 hafta yükseğe uzaklık; en çok yükselen/düşen özeti verir. BIST, ABD ve kripto karışık listelerde çalışır.",
    {
      symbols: z
        .array(z.string().min(1))
        .min(1)
        .max(20)
        .optional()
        .describe(
          "Sembol listesi (örn: ['THYAO', 'GARAN', 'AAPL', 'BTC-USD', 'XU100', 'USD/TRY']). Verilmezse save_watchlist ile kaydedilmiş kalıcı liste okunur."
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbols }) => {
      // Sembol verilmediyse kalıcı listeyi oku
      let stored: { updatedAt: string | null; invalid: boolean } | null = null;
      let list: string[] = symbols ?? [];
      if (list.length === 0) {
        const load = deps.load ?? loadWatchlist;
        const file = (deps.path ?? watchlistPath)();
        const loaded = await load(file);
        stored = { updatedAt: loaded.updatedAt, invalid: loaded.invalid };
        if (loaded.invalid) {
          return errorResponse(
            `Kalıcı izleme listesi dosyası bozuk: ${file}. save_watchlist ile mode=replace ile yeniden kaydedin.`
          );
        }
        if (loaded.symbols.length === 0) {
          return errorResponse(
            "Kalıcı izleme listesi boş. Önce save_watchlist ile semboller kaydedin ya da doğrudan symbols verin."
          );
        }
        list = loaded.symbols;
      }

      // Büyük/küçük harf farkını yok sayarak tekilleştir, gösterimde ilk yazımı koru
      const unique = new Map<string, string>();
      for (const raw of list) {
        const t = raw.trim();
        if (!t) continue;
        const key = t.toUpperCase();
        if (!unique.has(key)) unique.set(key, t);
      }
      const upper = [...unique.values()];
      if (upper.length === 0) return errorResponse("En az bir sembol girin.");

      try {
        const resolved = await deps.resolveTickers(upper);
        const quotes = await Promise.all(
          upper.map((s) => {
            const target = resolved.get(s) ?? s;
            return deps.fetchQuote(target).catch(() => undefined);
          })
        );
        const bySymbol = new Map(
          quotes.filter((q) => q?.symbol).map((q) => [q.symbol.toUpperCase(), q] as const)
        );

        const items: WatchItem[] = upper.map((input, i) => {
          const upperKey = input.toUpperCase();
          const q = bySymbol.get(upperKey.toUpperCase()) ?? quotes[i];
          return buildWatchItem(upperKey, q);
        });

        const priced = items.filter((i) => i.price !== null);
        if (priced.length === 0) {
          return errorResponse(
            `Hiçbir sembol için fiyat alınamadı: ${upper.join(", ")}. Sembolleri kontrol edin.`
          );
        }

        const ranked = rankByDay(items);
        const best = ranked[0] ?? null;
        const worst = [...ranked].reverse()[0] ?? null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: items.length,
                watchlist: ranked,
                topGainer: best && best.price !== null ? best : null,
                topLoser: worst && worst.price !== null ? worst : null,
                advanceDecline: {
                  up: items.filter((i) => (i.dayChangePercent ?? 0) > 0).length,
                  down: items.filter((i) => (i.dayChangePercent ?? 0) < 0).length,
                  unchanged: items.filter((i) => i.dayChangePercent === 0).length,
                },
                notFound: items.filter((i) => i.price === null).map((i) => i.symbol),
                stored:
                  stored === null
                    ? undefined
                    : {
                        fromFile: true,
                        updatedAt: stored.updatedAt,
                        file: (deps.path ?? watchlistPath)(),
                      },
                source: "Yahoo Finance (quote)",
              }),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `İzleme listesi alınamadı: ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      }
    }
  );
}

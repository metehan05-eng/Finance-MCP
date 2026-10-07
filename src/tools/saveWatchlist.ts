import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import {
  loadWatchlist,
  saveWatchlist,
  watchlistPath,
  MAX_WATCHLIST_SYMBOLS,
} from "../utils/watchlistStore.js";

/** Kalıcı izleme listesi depolama bağımlılığı (test edilebilirlik için). */
export interface SaveWatchlistDeps {
  load: typeof loadWatchlist;
  save: typeof saveWatchlist;
  path: typeof watchlistPath;
}

export const DEFAULT_SAVE_WATCHLIST_DEPS: SaveWatchlistDeps = {
  load: loadWatchlist,
  save: saveWatchlist,
  path: watchlistPath,
};

export type SaveMode = "replace" | "add" | "remove" | "clear";

/** Listeye göre işlemi uygular; sonuç listesini döner. */
export function applyMode(current: string[], incoming: string[], mode: SaveMode): string[] {
  if (mode === "clear") return [];
  if (mode === "replace") return incoming;

  const upper = new Set(incoming.map((s) => s.toUpperCase()));
  if (mode === "add") {
    const merged = [...current];
    for (const s of incoming) {
      if (!merged.some((m) => m.toUpperCase() === s.toUpperCase())) merged.push(s);
    }
    return merged;
  }
  // remove
  return current.filter((c) => !upper.has(c.toUpperCase()));
}

/**
 * Kalıcı izleme listesini kaydeder/ünceller.
 * `get_watchlist` bu listeyi sembol verilmediğinde okur.
 */
export function registerSaveWatchlist(
  server: McpServer,
  deps: SaveWatchlistDeps = DEFAULT_SAVE_WATCHLIST_DEPS
) {
  server.tool(
    "save_watchlist",
    "İzleme listesini diske kalıcı olarak kaydeder. mode: replace (tamamen değiştir), add (ekle), remove (çıkart), clear (temizle). Kaydedilen listeyi get_watchlist sembol vermeden çağırarak okuyabilirsiniz.",
    {
      symbols: z
        .array(z.string().min(1))
        .max(MAX_WATCHLIST_SYMBOLS)
        .describe(
          "Semboller (örn: ['THYAO', 'GARAN', 'AAPL', 'BTC-USD']). mode=clear ve mode=replace için boş bırakılabilir."
        ),
      mode: z
        .enum(["replace", "add", "remove", "clear"])
        .default("replace")
        .describe(
          "Kaydetme modu: replace=add, add=mevcut listeye ekle, remove=çıkar, clear=temizle"
        ),
    },
    { readOnlyHint: false, openWorldHint: false },
    async ({ symbols, mode }) => {
      try {
        const file = deps.path();
        const before = await deps.load(file);
        if (before.invalid) {
          return errorResponse(
            `İzleme listesi dosyası bozuk: ${file}. Sembolleri mode=replace ile yeniden kaydederek onarabilirsiniz.`
          );
        }

        const incoming = symbols ?? [];
        const next = applyMode(before.symbols, incoming, mode as SaveMode);

        if (mode === "remove") {
          const removedCount = before.symbols.length - next.length;
          if (removedCount === 0) {
            return errorResponse(
              incoming.length === 0
                ? "Çıkarılacak sembol verilmedi."
                : `Çıkarılacak semboller listede yok: ${incoming.join(", ")}`
            );
          }
        } else if (next.length === 0 && mode !== "clear") {
          return errorResponse(
            "Liste boş olamaz. En az bir sembol girin veya mode=clear kullanın."
          );
        }

        const saved = await deps.save(next, file);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode,
                  count: saved.symbols.length,
                  symbols: saved.symbols,
                  added: saved.symbols.filter(
                    (s) => !before.symbols.some((b) => b.toUpperCase() === s.toUpperCase())
                  ),
                  removed: before.symbols.filter(
                    (b) => !saved.symbols.some((s) => s.toUpperCase() === b.toUpperCase())
                  ),
                  file,
                  updatedAt: saved.updatedAt,
                  maxSymbols: MAX_WATCHLIST_SYMBOLS,
                  readHint: "get_watchlist çağrısında symbols vermezseniz bu liste okunur.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `İzleme listesi kaydedilemedi: ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      }
    }
  );
}

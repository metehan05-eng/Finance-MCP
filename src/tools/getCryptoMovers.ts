import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse, fetchWithRetry } from "../utils/fetchWithRetry.js";
import { round } from "../utils/financeMath.js";

const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?vs_currency=usd&order=market_cap_desc&per_page=250&page=1" +
  "&sparkline=false&price_change_percentage=7d,24h";

export interface Mover {
  rank: number | null;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
}

export interface MoverDeps {
  fetchJson: (url: string) => Promise<any>;
}

export const DEFAULT_MOVER_DEPS: MoverDeps = {
  fetchJson: async (url) => {
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};

/** CoinGecko /coins/markets satırını sadeleştirilmiş mover kaydına çevirir. */
export function parseMover(row: any): Mover {
  return {
    rank: typeof row?.market_cap_rank === "number" ? row.market_cap_rank : null,
    symbol: String(row?.symbol ?? "?").toUpperCase(),
    name: String(row?.name ?? "?"),
    priceUsd: typeof row?.current_price === "number" ? round(row.current_price) : null,
    change24hPct: round(row?.price_change_percentage_24h),
    change7dPct: round(row?.price_change_percentage_7d_in_currency),
    marketCapUsd: typeof row?.market_cap === "number" ? round(row.market_cap, 0) : null,
    volume24hUsd: typeof row?.total_volume === "number" ? round(row.total_volume, 0) : null,
  };
}

/**
 * Hareket alanına göre en yükselen / en düşen kripto listelerini sıralar.
 * `limit` sıfırdan büyükse ilk N kayıt, negatifse son N kayıt döner.
 */
export function sortByChange(
  rows: Mover[],
  key: "change24hPct" | "change7dPct",
  limit: number
): Mover[] {
  const sorted = [...rows].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
  const n = Math.abs(limit);
  return limit < 0 ? sorted.slice(-n).reverse() : sorted.slice(0, n);
}

/** Piyasa kapitalizasyonu eşiğinin altındaki coinleri filtreler. */
export function filterByMinCap(rows: Mover[], minCapUsd: number): Mover[] {
  if (minCapUsd <= 0) return rows;
  return rows.filter((r) => (r.marketCapUsd ?? 0) >= minCapUsd);
}

/** Hareket alanı boş kayıtları ayıklar. */
export function withChange(rows: Mover[], key: "change24hPct" | "change7dPct"): Mover[] {
  return rows.filter((r) => typeof r[key] === "number");
}

/**
 * Kripto piyasasının en çok yükselen ve en çok düşen para birimlerini döndürür.
 * CoinGecko (ücretsiz, API key yok).
 */
export function registerGetCryptoMovers(server: McpServer, deps: MoverDeps = DEFAULT_MOVER_DEPS) {
  server.tool(
    "get_crypto_movers",
    "Kripto piyasasının en çok yükselen ve en çok düşen para birimlerini döndürür (varsayılan 24 saat; 7 gün seçeneği var). Yalnızca piyasa kapitalizasyonu eşiğinin üzerindeki coinler sayılır (varsayılan: ilk 250 coin). CoinGecko (ücretsiz, API key yok).",
    {
      window: z
        .enum(["24h", "7d"])
        .default("24h")
        .describe("Hareket penceresi: 24 saat veya 7 gün"),
      limit: z
        .number()
        .int()
        .min(3)
        .max(25)
        .default(10)
        .describe("Her liste için kaç coin dönsün (3-25)"),
      minMarketCapUsd: z
        .number()
        .nonnegative()
        .default(0)
        .describe(
          "Minimum piyasa kapitalizasyonu (USD). 0 = filtre yok. Örn. 1000000000 (1 milyar $) ile yalnızca büyük coinler"
        ),
    },
    async ({ window, limit, minMarketCapUsd }) => {
      const key = window === "7d" ? "change7dPct" : "change24hPct";
      try {
        const raw = await deps.fetchJson(MARKETS_URL);
        if (!Array.isArray(raw) || raw.length === 0) {
          return errorResponse(
            "Kripto hareket verisi alınamadı (boş yanıt). CoinGecko geçici olarak sınırlandırılmış olabilir, birazdan tekrar deneyin."
          );
        }

        const all = raw.map(parseMover);
        const eligible = withChange(filterByMinCap(all, minMarketCapUsd), key);

        if (eligible.length === 0) {
          return errorResponse(
            "Seçilen filtrelere uyan ve hareket verisi olan coin kalmadı. minMarketCapUsd değerini düşürün veya pencereyi değiştirin."
          );
        }

        const gainers = sortByChange(eligible, key, limit);
        const losers = sortByChange(eligible, key, -limit);
        const changes = eligible.map((r) => r[key] as number);
        const median = [...changes].sort((a, b) => a - b)[Math.floor(changes.length / 2)];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  window,
                  universeSize: all.length,
                  eligibleCount: eligible.length,
                  minMarketCapUsd,
                  marketMedianChangePct: round(median),
                  gainers,
                  losers,
                  note: "Sıralama CoinGecko piyasa kapitalizasyonu sıralamasındaki ilk 250 coin üzerinden yapılır; hacmi düşük 'pump' coinler bu sıralamayı etkileyebilir.",
                  source: "CoinGecko",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(
          `Kripto hareket verisi alınamadı: ${msg}. CoinGecko ücretsiz katmanı dakikada sınırlı istek kabul eder; birazdan tekrar deneyin.`
        );
      }
    }
  );
}

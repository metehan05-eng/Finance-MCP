import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse, fetchWithRetry } from "../utils/fetchWithRetry.js";
import { round } from "../utils/financeMath.js";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";

interface MarketEntry {
  name: string;
  symbol: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCapRank: number | null;
}

/** CoinGecko /global yanıtını sadeleştirilmiş özete çevirir. */
export function parseGlobalMarket(data: any): Record<string, unknown> {
  const d = data?.data ?? {};
  return {
    totalMarketCapUsd: round(d.total_market_cap?.usd, 0),
    totalVolume24hUsd: round(d.total_volume?.usd, 0),
    marketCapChange24hPercent: round(d.market_cap_change_percentage_24h_usd),
    btcDominance: round(d.market_cap_percentage?.btc),
    ethDominance: round(d.market_cap_percentage?.eth),
    activeCryptocurrencies: d.active_cryptocurrencies ?? null,
    markets: d.markets ?? null,
    updatedAt: d.updated_at ? new Date(Number(d.updated_at) * 1000).toISOString() : null,
  };
}

/** Trending yanıtından en çok aranan kripto listesini çıkarır. */
export function parseTrendingCoins(data: any): MarketEntry[] {
  const coins = data?.coins ?? [];
  return coins.map((c: any) => {
    const item = c?.item ?? {};
    const data0 = item?.data ?? {};
    const price = data0?.price ?? 0;
    return {
      name: String(item?.name ?? "?"),
      symbol: String(item?.symbol ?? "?"),
      priceUsd: price ? round(price) : null,
      change24h: round(data0?.price_change_percentage_24h?.usd),
      marketCapRank: item?.market_cap_rank ?? null,
    };
  });
}

/**
 * Kripto piyasası genel görünümü (piyasa kapitalizasyonu, BTC dominansı, trend).
 */
export function registerGetCryptoMarketOverview(server: McpServer) {
  server.tool(
    "get_crypto_market_overview",
    "Kripto para piyasasının genel görünümünü döndürür: toplam piyasa kapitalizasyonu, 24 saatlik hacim ve değişim, Bitcoin/Ethereum dominansı ve en çok aranan kripto paralar. CoinGecko (ücretsiz, API key yok).",
    {
      includeTrending: z
        .boolean()
        .default(true)
        .describe("En çok aranan (trending) kripto listesi de dahil edilsin mi"),
    },
    async ({ includeTrending }) => {
      try {
        const globalRes = await fetchWithRetry(GLOBAL_URL, {
          headers: { Accept: "application/json" },
        });
        if (!globalRes.ok) {
          return errorResponse(`Kripto piyasa verisi alınamadı (HTTP ${globalRes.status}).`);
        }
        const summary = parseGlobalMarket(await globalRes.json());

        let trending: MarketEntry[] = [];
        if (includeTrending) {
          try {
            const tRes = await fetchWithRetry(TRENDING_URL, {
              headers: { Accept: "application/json" },
            });
            if (tRes.ok) trending = parseTrendingCoins(await tRes.json());
          } catch {
            /* trending opsiyonel */
          }
        }

        const btc = Number(summary.btcDominance ?? 0);
        const eth = Number(summary.ethDominance ?? 0);
        const chg = summary.marketCapChange24hPercent as number | null;
        const rest = btc + eth >= 0 ? round(100 - btc - eth) : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...summary,
                  dominance: {
                    bitcoinPercent: summary.btcDominance,
                    ethereumPercent: summary.ethDominance,
                    othersPercent: rest,
                  },
                  sentiment:
                    chg === null
                      ? null
                      : chg > 2
                        ? "güçlü risk iştahı"
                        : chg > 0
                          ? "ılımlı pozitif"
                          : chg > -2
                            ? "ılımlı negatif"
                            : "belirgin satış baskısı",
                  trending,
                  source: "CoinGecko API (/global, /search/trending)",
                  dataNote:
                    "Kripto verileri 24/7 işlem gördüğü için 'günlük' değişim anlık değildir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Kripto piyasa özeti alınamadı: ${msg}`);
      }
    }
  );
}

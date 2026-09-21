import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export function registerGetMultiCryptoPrice(server: McpServer) {
  server.tool(
    "get_multi_crypto_price",
    "Birden fazla kripto paranın fiyatını tek sorguda döndürür. Ör: bitcoin, ethereum ve solana'nın TRY cinsinden fiyatlarını aynı anda alabilirsiniz.",
    {
      coinIds: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe(
          "CoinGecko coin id listesi, ör. ['bitcoin', 'ethereum', 'solana', 'binancecoin'] (max 10)"
        ),
      vsCurrency: z
        .string()
        .default("usd")
        .describe("Fiyatların gösterileceği para birimi, ör. 'usd', 'try', 'eur'"),
    },
    async ({ coinIds, vsCurrency }) => {
      const currency = vsCurrency.toLowerCase();
      const ids = coinIds.map((id) => id.toLowerCase().trim());
      const idsParam = ids.join(",");

      const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=${encodeURIComponent(currency)}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      try {
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          return errorResponse(
            `Fiyat bilgisi alınamadı (HTTP ${response.status}). CoinGecko geçici kısıtlama uyguluyor olabilir.`
          );
        }

        const data = (await response.json()) as Record<
          string,
          Record<string, number>
        >;

        const results: Record<
          string,
          {
            price: number | null;
            change24h: number | null;
            marketCap: number | null;
            volume24h: number | null;
            found: boolean;
          }
        > = {};

        for (const id of ids) {
          const coinData = data[id];
          if (!coinData || coinData[currency] === undefined) {
            results[id] = {
              price: null,
              change24h: null,
              marketCap: null,
              volume24h: null,
              found: false,
            };
          } else {
            results[id] = {
              price: coinData[currency],
              change24h: coinData[`${currency}_24h_change`] ?? null,
              marketCap: coinData[`${currency}_market_cap`] ?? null,
              volume24h: coinData[`${currency}_24h_vol`] ?? null,
              found: true,
            };
          }
        }

        const notFound = ids.filter((id) => !results[id]?.found);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  vsCurrency: currency,
                  prices: results,
                  queriedCoins: ids.length,
                  notFound: notFound.length > 0 ? notFound : undefined,
                  source: "CoinGecko",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return errorResponse(
          `Ağ hatası: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

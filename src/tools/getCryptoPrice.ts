import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export function registerGetCryptoPrice(server: McpServer) {
  server.tool(
    "get_crypto_price",
    "Bir kripto paranın belirtilen para birimi cinsinden güncel fiyatını, 24 saatlik değişimini ve piyasa değerini döndürür (örn. bitcoin → try).",
    {
      coinId: z
        .string()
        .describe(
          "CoinGecko coin id'si, ör. 'bitcoin', 'ethereum', 'solana' (sembol değil, tam id)"
        ),
      vsCurrency: z
        .string()
        .default("usd")
        .describe("Fiyatın gösterileceği para birimi, ör. 'usd', 'try', 'eur'"),
    },
    async ({ coinId, vsCurrency }) => {
      const currency = vsCurrency.toLowerCase();
      const id = coinId.toLowerCase();

      const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(currency)}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      try {
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          return errorResponse(
            `Fiyat bilgisi alınamadı (HTTP ${response.status}). CoinGecko geçici olarak kısıtlıyor olabilir, birkaç saniye bekleyip tekrar deneyin.`
          );
        }

        const data = (await response.json()) as Record<
          string,
          Record<string, number>
        >;

        const coinData = data[id];

        if (!coinData || coinData[currency] === undefined) {
          return errorResponse(
            `'${id}' için '${currency}' cinsinden fiyat bulunamadı. Coin id'sinin doğru olduğundan emin olun (CoinGecko id formatında, sembol değil).`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  coin: id,
                  vsCurrency: currency,
                  price: coinData[currency],
                  change24h: coinData[`${currency}_24h_change`] ?? null,
                  marketCap: coinData[`${currency}_market_cap`] ?? null,
                  volume24h: coinData[`${currency}_24h_vol`] ?? null,
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

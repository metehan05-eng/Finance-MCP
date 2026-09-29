import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse, fetchWithRetry } from "../utils/fetchWithRetry.js";

const FNG_URL = "https://api.alternative.me/fng/?limit=30&format=json";

/**
 * Kripto Korku ve Açgözlülük Endeksi.
 * Kaynak: alternative.me (ücretsiz, API anahtarı gerektirmez).
 */
export function registerGetCryptoFearGreed(server: McpServer) {
  server.tool(
    "get_crypto_fear_greed",
    "Kripto Korku ve Açgözlülük Endeksi (0-100) güncel değerini ve son 30 günlük geçmişini döndürür. 0=aşırı korku, 100=aşırı açgözlülük. Piyasa duygu analizi ve zamanlama için.",
    {
      history: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(30)
        .describe("Kaç günlük geçmiş gösterilsin (max 30)"),
    },
    async ({ history }) => {
      try {
        const response = await fetchWithRetry(FNG_URL, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          return errorResponse(`Korku/Açgözlülük endeksi alınamadı (HTTP ${response.status}).`);
        }

        const json: any = await response.json();
        const data: any[] = Array.isArray(json?.data) ? json.data : [];
        if (data.length === 0) {
          return errorResponse("Korku/Açgözlülük endeksi verisi boş.");
        }

        const toItem = (d: any) => ({
          date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10),
          value: Number(d.value),
          classification: d.value_classification,
        });

        const current = toItem(data[0]);
        const historyItems = data.slice(0, history).map(toItem);
        const values = historyItems.map((h) => h.value);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  current,
                  change7d: values.length >= 7 ? values[0] - values[6] : null,
                  average30d: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
                  history: historyItems,
                  scale: {
                    0: "Aşırı Korku (Extreme Fear)",
                    25: "Korku (Fear)",
                    50: "Nötr (Neutral)",
                    75: "Açgözlülük (Greed)",
                    100: "Aşırı Açgözlülük (Extreme Greed)",
                  },
                  source: "alternative.me Crypto Fear & Greed Index",
                  dataNote:
                    "Endeks duyarlılık ölçümüdür, fiyat tahmini değildir. Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Korku/Açgözlülük endeksi alınamadı: ${msg}`);
      }
    }
  );
}

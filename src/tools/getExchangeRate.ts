import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

// Frankfurter.app: ECB tabanlı, ücretsiz ve API key gerektirmeyen döviz kuru servisi.
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export function registerGetExchangeRate(server: McpServer) {
  server.tool(
    "get_exchange_rate",
    "İki para birimi arasındaki güncel (veya belirli bir tarihteki) döviz kurunu döndürür (örn. USD → TRY).",
    {
      from: z
        .string()
        .length(3)
        .describe("Kaynak para birimi kodu, ör. USD, EUR, TRY"),
      to: z
        .string()
        .length(3)
        .describe("Hedef para birimi kodu, ör. TRY, USD, EUR"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Opsiyonel tarih (YYYY-MM-DD). Belirtilmezse en güncel kur döndürülür."
        ),
    },
    async ({ from, to, date }) => {
      const fromCode = from.toUpperCase();
      const toCode = to.toUpperCase();
      const endpoint = date ? `/${date}` : "/latest";
      const url = `${FRANKFURTER_BASE}${endpoint}?from=${fromCode}&to=${toCode}`;

      try {
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          return errorResponse(
            `Kur bilgisi alınamadı (HTTP ${response.status}). Para birimi kodlarını veya tarihi kontrol edin.`
          );
        }

        const data = (await response.json()) as {
          amount: number;
          base: string;
          date: string;
          rates: Record<string, number>;
        };

        const rate = data.rates[toCode];

        if (rate === undefined) {
          return errorResponse(
            `${toCode} için kur bulunamadı. Desteklenmeyen bir para birimi olabilir.`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  from: fromCode,
                  to: toCode,
                  rate,
                  date: data.date,
                  source: "Frankfurter (ECB)",
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

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export function registerGetHistoricalRate(server: McpServer) {
  server.tool(
    "get_historical_rate",
    "Belirtilen bir tarihteki döviz kurunu döndürür. Geçmiş ECB/Frankfurter verilerine (1999'dan itibaren) erişim sağlar.",
    {
      from: z
        .string()
        .length(3)
        .describe("Kaynak para birimi kodu, ör. USD, EUR, GBP"),
      to: z
        .string()
        .length(3)
        .describe("Hedef para birimi kodu, ör. TRY, USD, EUR"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalı")
        .describe(
          "Kur bilgisi istenilen tarih (YYYY-MM-DD). 1999-01-04'ten itibaren desteklenir."
        ),
    },
    async ({ from, to, date }) => {
      const fromCode = from.toUpperCase();
      const toCode = to.toUpperCase();

      const url = `${FRANKFURTER_BASE}/${date}?from=${fromCode}&to=${toCode}`;

      try {
        const response = await fetchWithRetry(url);

        if (response.status === 404) {
          return errorResponse(
            `${date} tarihinde kur verisi bulunamadı. Tatil veya hafta sonu olabilir ya da 1999-01-04 öncesi bir tarih girilmiş olabilir.`
          );
        }

        if (!response.ok) {
          return errorResponse(
            `Geçmiş kur verisi alınamadı (HTTP ${response.status}). Para birimi kodlarını veya tarihi kontrol edin.`
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
            `${toCode} için ${date} tarihli kur bulunamadı.`
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
                  requestedDate: date,
                  actualDate: data.date,
                  source: "Frankfurter (ECB)",
                  note:
                    data.date !== date
                      ? `Belirtilen tarihte veri yok; en yakın iş günü (${data.date}) verisi döndürüldü.`
                      : undefined,
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

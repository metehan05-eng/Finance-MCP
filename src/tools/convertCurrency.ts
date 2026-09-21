import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export function registerConvertCurrency(server: McpServer) {
  server.tool(
    "convert_currency",
    "Bir miktarı bir para biriminden diğerine, güncel kur üzerinden çevirir.",
    {
      amount: z.number().positive().describe("Çevrilecek miktar, ör. 100"),
      from: z.string().length(3).describe("Kaynak para birimi kodu, ör. USD"),
      to: z.string().length(3).describe("Hedef para birimi kodu, ör. TRY"),
    },
    async ({ amount, from, to }) => {
      const fromCode = from.toUpperCase();
      const toCode = to.toUpperCase();

      const url = `${FRANKFURTER_BASE}/latest?amount=${amount}&from=${fromCode}&to=${toCode}`;

      try {
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          return errorResponse(
            `Çevrim yapılamadı (HTTP ${response.status}). Para birimi kodlarını kontrol edin.`
          );
        }

        const data = (await response.json()) as {
          amount: number;
          base: string;
          date: string;
          rates: Record<string, number>;
        };

        const converted = data.rates[toCode];

        if (converted === undefined) {
          return errorResponse(
            `${toCode} için çevrim yapılamadı. Desteklenmeyen bir para birimi olabilir.`
          );
        }

        const rate = converted / amount;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  originalAmount: amount,
                  from: fromCode,
                  to: toCode,
                  convertedAmount: converted,
                  exchangeRate: rate,
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

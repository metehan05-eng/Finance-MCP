import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { parseTcmbXml } from "../utils/xmlParser.js";

// TCMB resmi günlük kur bülteni — API key gerektirmez, ECB'ye göre alış/satış ayrımı sağlar.
const TCMB_XML_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

export function registerGetTcmbRate(server: McpServer) {
  server.tool(
    "get_tcmb_rate",
    "TCMB (Türkiye Cumhuriyet Merkez Bankası) resmi günlük kur bülteninden, belirtilen dövizin alış ve satış kurlarını TRY cinsinden döndürür. Frankfurter'dan farklı olarak resmi alış/satış ayrımı içerir.",
    {
      currencyCode: z
        .string()
        .length(3)
        .describe(
          "Para birimi kodu, ör. USD, EUR, GBP, JPY, CHF, SEK, NOK, DKK, CAD, AUD, KWD, SAR"
        ),
    },
    async ({ currencyCode }) => {
      const code = currencyCode.toUpperCase();

      try {
        const response = await fetchWithRetry(TCMB_XML_URL);

        if (!response.ok) {
          return errorResponse(
            `TCMB veri alınamadı (HTTP ${response.status}). Hafta sonu veya resmi tatillerde bülten güncellenmeyebilir.`
          );
        }

        const xmlText = await response.text();
        const tcmbData = parseTcmbXml(xmlText);

        const currency = tcmbData.currencies.find((c) => c.code === code);

        if (!currency) {
          const available = tcmbData.currencies.map((c) => c.code).join(", ");
          return errorResponse(
            `'${code}' TCMB bülteninde bulunamadı. Mevcut kodlar: ${available}`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  currencyCode: currency.code,
                  currencyName: currency.currencyName,
                  unit: currency.unit,
                  forexBuying: currency.forexBuying,
                  forexSelling: currency.forexSelling,
                  banknoteBuying: currency.banknoteBuying,
                  banknoteSelling: currency.banknoteSelling,
                  baseCurrency: "TRY",
                  date: tcmbData.date,
                  bulletinNo: tcmbData.bulletinNo,
                  source: "TCMB (Türkiye Cumhuriyet Merkez Bankası)",
                  note:
                    currency.unit > 1
                      ? `Kurlar ${currency.unit} birim ${currency.code} için verilmiştir.`
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

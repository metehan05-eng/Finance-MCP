import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

// Türkiye TÜFE enflasyonu — Dünya Bankası API (ücretsiz, anahtarsız).
// FRED'in TURCP serisi (eski kaynak) artık yanıt vermediği için değiştirildi.
const WB_BASE = "https://api.worldbank.org/v2/country/TUR/indicator";
const SERIES_ID = "FP.CPI.TOTL.ZG"; // Yıllık TÜFE % değişimi (annual CPI growth %)

interface WbDataPoint {
  date: string;
  value: number | null;
}

async function fetchWorldBankSeries(startYear: number, endYear: number): Promise<WbDataPoint[]> {
  const url = `${WB_BASE}/${SERIES_ID}?format=json&per_page=1000&date=${startYear}:${endYear}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) {
    throw new Error(`Dünya Bankası yanıt vermedi (HTTP ${resp.status})`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await resp.json();
  const rows = (Array.isArray(json) ? json[1] : null) ?? [];
  return rows
    .filter((r: any) => r?.date != null && r.value != null)
    .map((r: any) => ({
      date: String(r.date),
      value: typeof r.value === "number" ? r.value : parseFloat(r.value) || null,
    }));
}

export function registerGetInflationData(server: McpServer) {
  server.tool(
    "get_inflation_data",
    "Türkiye TÜFE (Tüketici Fiyat Endeksi) enflasyon verisini döndürür. Kaynak: Dünya Bankası (TÜİK kaynaklı yıllık TÜFE değişim %, FP.CPI.TOTL.ZG). Yıllık ortalama seridir.",
    {
      periods: z
        .number()
        .int()
        .min(1)
        .max(40)
        .default(12)
        .describe("Kaç yıllık veri döndürülsün (1-40, default: 12)"),
    },
    async ({ periods }) => {
      const endYear = new Date().getFullYear();
      const startYear = endYear - (periods - 1);

      try {
        let data = await fetchWorldBankSeries(startYear, endYear);

        // Yıla göre artan (eski → yeni) sırala ve değerleri yuvarıla
        data.sort((a, b) => Number(a.date) - Number(b.date));
        const rounded = data.map((d) => ({ date: d.date, value: d.value != null ? Number(d.value.toFixed(2)) : d.value }));

        if (rounded.length === 0) {
          return errorResponse(
            "Enflasyon verisi bulunamadı. Dünya Bankası serisi bu aralıkta veri döndürmedi."
          );
        }

        const latest = rounded[rounded.length - 1];
        const values = rounded.map((d) => d.value ?? 0);
        const min = Math.min(...values);
        const max = Math.max(...values);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  seriesId: SERIES_ID,
                  description:
                    "Türkiye TÜFE yıllık % değişim (Dünya Bankası / TÜİK kaynaklı)",
                  frequency: "yıllık (ortalama)",
                  unit: "yıllık % değişim",
                  latestDate: latest.date,
                  latestRate: latest.value,
                  periodCount: rounded.length,
                  minRate: min,
                  maxRate: max,
                  averageOverPeriod: Number(
                    (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
                  ),
                  data: rounded,
                  source: "Dünya Bankası API (World Bank, TÜİK kaynaklı)",
                  dataNote:
                    "Yıllık ortalama TÜFE değişimidir; aylık güncel TÜFE için TÜİK açıklamalarını takip edin. Yatırım tavsiyesi değildir.",
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
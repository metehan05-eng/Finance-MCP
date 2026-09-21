import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";

// FRED (St. Louis Fed) — ücretsiz, anahtarsız, Türkiye makro verilerini içerir.
// TURCP: Türkiye TÜFE yıllık % değişimi (Consumer Price Index, All Items for Türkiye)
const FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const SERIES_ID = "TURCP"; // Yıllık enflasyon %

export function registerGetInflationData(server: McpServer) {
  server.tool(
    "get_inflation_data",
    "Türkiye TÜFE (Tüketici Fiyat Endeksi) enflasyon verisini döndürür. FRED (St. Louis Fed) üzerinden TÜİK kaynaklı yıllık % değişim verisi sağlanır.",
    {
      periods: z
        .number()
        .int()
        .min(1)
        .max(120)
        .default(12)
        .describe("Kaç aylık veri döndürülsün (1-120, default: 12)"),
    },
    async ({ periods }) => {
      // FRED CSV endpoint — API key gerektirmez
      const url = `${FRED_BASE}?id=${SERIES_ID}`;

      try {
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          return errorResponse(
            `Enflasyon verisi alınamadı (HTTP ${response.status}).`
          );
        }

        const csvText = await response.text();
        const lines = csvText.trim().split("\n");

        // İlk satır başlık: DATE,TURCP
        if (lines.length < 2) {
          return errorResponse("Enflasyon verisi boş veya hatalı formatta.");
        }

        interface DataPoint {
          date: string;
          inflationRate: number | null;
        }

        const dataPoints: DataPoint[] = lines
          .slice(1) // başlığı atla
          .map((line) => {
            const [date, value] = line.split(",");
            const n = parseFloat(value ?? "");
            return {
              date: date?.trim() ?? "",
              inflationRate: isNaN(n) ? null : n,
            };
          })
          .filter((d) => d.date !== "");

        // Son N periyot
        const recent = dataPoints.slice(-periods);
        const latest = recent[recent.length - 1];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  seriesId: SERIES_ID,
                  description:
                    "Türkiye TÜFE Yıllık % Değişim (TÜİK kaynaklı, FRED üzerinden)",
                  unit: "yıllık % değişim",
                  latestDate: latest?.date ?? null,
                  latestRate: latest?.inflationRate ?? null,
                  periodCount: recent.length,
                  data: recent,
                  source: "FRED — St. Louis Fed (TÜİK verileri)",
                  dataNote:
                    "Veriler aylık frekansta güncellenir; en güncel ay yayın takvimlerine göre 1-2 ay gecikmeli olabilir.",
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

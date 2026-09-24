import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithRetry, errorResponse } from "../utils/fetchWithRetry.js";
import { round } from "../utils/financeMath.js";

/**
 * Dünya Bankası (World Bank) API — ücretsiz, API anahtarı gerektirmez.
 * https://api.worldbank.org/v2/country/{iso3}/indicator/{code}?format=json
 */
const WB_BASE = "https://api.worldbank.org/v2/country";

/**
 * FRED tamamlayıcı seriler (çeyreklik/aylık ek bağlam için).
 */
const FRED_SUPPLEMENTARY: Record<string, { id: string; name: string; freq: string }> = {
  quarterlyGdp: { id: "NGDPRSAXDCTRQ", name: "Reel GSYİH (milyon TL, mevsimsel)", freq: "çeyreklik" },
  discountRate: { id: "INTDSRTRM193N", name: "TCMB İskonto / politika faizi (IMF)", freq: "aylık" },
};

const WB_INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  format: (v: number | null) => number | null;
}> = [
  { code: "NY.GDP.MKTP.KD.ZG", name: "GSYİH büyümesi", unit: "% (yıllık)", format: (v) => round(v, 2) },
  { code: "NY.GDP.PCAP.CD", name: "Kişi başına GSYİH", unit: "ABD doları", format: (v) => v ? Math.round(v) : null },
  { code: "FP.CPI.TOTL.ZG", name: "Enflasyon (TÜFE)", unit: "% (yıllık ort.)", format: (v) => round(v, 2) },
  { code: "SL.UEM.TOTL.ZS", name: "İşsizlik oranı", unit: "%", format: (v) => round(v, 2) },
  { code: "BN.CAB.XOKA.GD.ZS", name: "Cari işlemler dengesi", unit: "% GSYİH", format: (v) => round(v, 2) },
  { code: "FI.RES.TOTL.CD", name: "Toplam rezervler", unit: "ABD doları", format: (v) => v ? Math.round(v) : null },
  { code: "NE.EXP.GNFS.CD", name: "İhracat", unit: "ABD doları", format: (v) => v ? Math.round(v) : null },
  { code: "NE.IMP.GNFS.CD", name: "İthalat", unit: "ABD doları", format: (v) => v ? Math.round(v) : null },
];

/**
 * Türkiye (veya istenen ülke) makroekonomik göstergeleri:
 * GSYİH, enflasyon, işsizlik, cari açık, rezervler, dış ticaret.
 */
export function registerGetMacroIndicators(server: McpServer) {
  server.tool(
    "get_macro_indicators",
    "Bir ülkenin temel makroekonomik göstergelerini döndürür (varsayılan: Türkiye): GSYİH büyümesi, kişi başına GSYİH, enflasyon, işsizlik, cari işlemler, rezervler, ihracat/ithalat. Dünya Bankası + FRED kaynaklı.",
    {
      country: z
        .string()
        .length(3)
        .default("TUR")
        .describe("ISO 3 harfli ülke kodu (örn. TUR, USA, DEU, JPN)"),
      years: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Geriye dönük kaç yıl gösterilsin (Dünya Bankası yıllık veridir)"),
    },
    async ({ country, years }) => {
      const iso = country.toUpperCase();
      const endYear = new Date().getFullYear();
      const startYear = endYear - (years - 1);

      try {
        const results = await Promise.all(
          WB_INDICATORS.map(async (ind) => {
            const url = `${WB_BASE}/${iso}/indicator/${ind.code}?format=json&per_page=100&date=${startYear}:${endYear}`;
            try {
              const resp = await fetchWithRetry(url);
              if (!resp.ok) return { ...ind, error: `HTTP ${resp.status}` };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const json: any[] = await resp.json();
              const rows = (Array.isArray(json) ? json[1] : null) ?? [];
              const series: Record<string, number | null> = {};
              for (const r of rows) {
                if (r?.date && r.value != null) {
                  series[String(r.date)] = ind.format(typeof r.value === "number" ? r.value : parseFloat(r.value) || null);
                }
              }
              return { ...ind, series };
            } catch {
              return { ...ind, error: "ağ hatası" };
            }
          })
        );

        // FRED tamamlayıcılar
        const fred: Record<string, { name: string; freq: string; latestDate: string | null; latestValue: number | null }> = {};
        for (const [key, meta] of Object.entries(FRED_SUPPLEMENTARY)) {
          try {
            const resp = await fetchWithRetry(
              `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${meta.id}`,
              { headers: { Accept: "text/csv" } }
            );
            if (resp.ok) {
              const csv = await resp.text();
              const lines = csv.trim().split("\n").slice(1).filter((l) => l.trim() && !l.startsWith("observation_date"));
              const last = (lines[lines.length - 1] ?? "").split(",");
              if (last[0]) {
                fred[key] = {
                  name: meta.name,
                  freq: meta.freq,
                  latestDate: last[0],
                  latestValue: last[1] ? round(parseFloat(last[1])) : null,
                };
              }
            }
          } catch {
            /* FRED yanıt vermezse atla */
          }
        }

        // Yıl × gösterge tablo görünümü
        const yearsRange: number[] = [];
        for (let y = startYear; y <= endYear; y++) yearsRange.push(y);
        const table = yearsRange.map((year) => {
          const row: Record<string, number | string | null> = { year };
          for (const ind of results) {
            const anyInd = ind as any;
            if (anyInd.error) continue;
            row[ind.code] = anyInd.series?.[String(year)] ?? null;
          }
          return row;
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  country: iso,
                  frequency: "yıllık (Dünya Bankası)",
                  indicators: results.map((r) => ({
                    code: r.code,
                    name: r.name,
                    unit: r.unit,
                    error: (r as any).error ?? undefined,
                  })),
                  table,
                  supplementary: fred,
                  source: "Dünya Bankası API + FRED (St. Louis Fed)",
                  dataNote: "Dünya Bankası verileri yıllıktır ve bir yıl gecikmeli yayımlanabilir.",
                },
                null,
                1
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Makro veri alınamadı: ${msg}`);
      }
    }
  );
}
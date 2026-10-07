import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { fetchQuotes } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

/**
 * Yahoo'da gerçekten karşılığı doğrulanmış BIST endeksleri (2025-10).
 * Doğrulanmayan kodlar (örn. XU015, XU010, XMESM, XKAGIT) bilinçli olarak yok:
 * Yahoo bu sembollerde boş sonuç döndürüyor.
 */
export const BIST_INDICES: Record<string, { name: string; kind: "benchmark" | "sector" }> = {
  XU100: { name: "BIST 100", kind: "benchmark" },
  XU030: { name: "BIST 30", kind: "benchmark" },
  XU050: { name: "BIST 50", kind: "benchmark" },
  XBANK: { name: "BIST BANKA", kind: "sector" },
  XUTEK: { name: "BIST TEKNOLOJİ", kind: "sector" },
  XGMYO: { name: "BIST GAYRİMENKUL", kind: "sector" },
  XILTM: { name: "BIST İLETİŞİM", kind: "sector" },
  XUSIN: { name: "BIST SANAYİ", kind: "sector" },
};

/** Karşılaştırma tabanı (benchmark) kodu. */
export const BIST_BENCHMARK = "XU100";

/** Verilmezse kullanılan kodlar. */
const DEFAULT_CODES = ["XU100", "XU030", "XBANK", "XUTEK"];

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface BistDeps {
  fetchQuotes: typeof fetchQuotes;
}

export const DEFAULT_BIST_DEPS: BistDeps = { fetchQuotes };

/** Doğrulanmış sektör kodu listesi. */
export const BIST_SECTOR_CODES = Object.entries(BIST_INDICES)
  .filter(([, v]) => v.kind === "sector")
  .map(([k]) => k);

/**
 * Sektörlerin BIST 100'e göre göreli performansını hesaplar ve sıralar.
 */
export function sectorPerformance(
  items: Array<{ index: string; name: string; changePercent: number | null }>
): {
  benchmark: { code: string; changePercent: number | null } | null;
  sectors: Array<{
    index: string;
    name: string;
    changePercent: number | null;
    relativeToBenchmarkPct: number | null;
    outperforming: boolean | null;
  }>;
  leader: string | null;
  laggard: string | null;
} {
  const bench = items.find((i) => i.index === BIST_BENCHMARK) ?? null;
  const benchPct = bench?.changePercent ?? null;

  const sectors = items
    .filter((i) => BIST_INDICES[i.index]?.kind === "sector")
    .map((i) => {
      const rel =
        i.changePercent !== null && benchPct !== null ? round(i.changePercent - benchPct) : null;
      return {
        index: i.index,
        name: i.name,
        changePercent: i.changePercent,
        relativeToBenchmarkPct: rel,
        outperforming: rel === null ? null : rel > 0,
      };
    })
    .sort(
      (a, b) => (b.relativeToBenchmarkPct ?? -Infinity) - (a.relativeToBenchmarkPct ?? -Infinity)
    );

  return {
    benchmark: bench ? { code: bench.index, changePercent: benchPct } : null,
    sectors,
    leader: sectors[0]?.index ?? null,
    laggard: sectors.length > 0 ? sectors[sectors.length - 1].index : null,
  };
}

/**
 * BIST endekslerinin güncel değerini, sektör kırılımını ve göreli performansını döndürür.
 */
export function registerGetBistIndices(server: McpServer, deps: BistDeps = DEFAULT_BIST_DEPS) {
  server.tool(
    "get_bist_indices",
    "Borsa İstanbul (BIST) endekslerinin güncel değerini ve sektör kırılımını döndürür. Sektörler (XBANK, XUTEK, XGMYO, XILTM, XUSIN) BIST 100'e göre sıralanır. Varsayılan: XU100, XU030, XBANK, XUTEK.",
    {
      indices: z
        .array(z.string())
        .min(1)
        .max(10)
        .optional()
        .describe(
          `Endeks kodları listesi (örn. ['XU100','XBANK']). Verilmezse ana endeksler (${DEFAULT_CODES.join(", ")}) kullanılır. Doğrulanmış kodlar: ${Object.keys(BIST_INDICES).join(", ")}.`
        ),
      includeSectorPerformance: z
        .boolean()
        .default(true)
        .describe("Sektörlerin BIST 100'e göre göreli performansı hesaplansın mı"),
    },
    async ({ indices, includeSectorPerformance }) => {
      const codes = (indices ?? DEFAULT_CODES).map((c) => c.toUpperCase().replace(/\.IS$/i, ""));

      const unknown = codes.filter((c) => !BIST_INDICES[c]);

      try {
        const quotes = await deps.fetchQuotes(codes.map((c) => `${c}.IS`));

        const items = quotes
          .filter((q: any) => q?.symbol)
          .map((q: any) => {
            const code = String(q.symbol).replace(/\.IS$/i, "");
            return {
              index: code,
              name: BIST_INDICES[code]?.name ?? q.longName ?? q.shortName ?? code,
              kind: BIST_INDICES[code]?.kind ?? "other",
              value: q.regularMarketPrice ?? null,
              change: q.regularMarketChange ?? null,
              changePercent: round(q.regularMarketChangePercent),
              open: q.regularMarketOpen ?? null,
              dayHigh: q.regularMarketDayHigh ?? null,
              dayLow: q.regularMarketDayLow ?? null,
              previousClose: q.regularMarketPreviousClose ?? null,
              volume: q.regularMarketVolume ?? null,
              marketState: q.marketState ?? null,
            };
          });

        const requested = codes.map((c) => BIST_INDICES[c]?.name).filter(Boolean) as string[];
        const notFound = requested.filter(
          (name) => !items.some((i: any) => i.name === name && i.value !== null)
        );

        const withValue = items.filter((i: any) => i.value !== null);
        if (withValue.length === 0) {
          return errorResponse(
            `Seçilen endeksler için fiyat alınamadı: ${codes.join(", ")}. Geçerli kodlar: ${Object.keys(
              BIST_INDICES
            ).join(", ")}`
          );
        }
        const avgChange =
          withValue.length > 0
            ? round(
                withValue.reduce((a: number, i: any) => a + (i.changePercent ?? 0), 0) /
                  withValue.length
              )
            : null;

        const sectors = includeSectorPerformance ? sectorPerformance(items) : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  queriedIndices: items.length,
                  avgChangePercent: avgChange,
                  indices: items,
                  sectorPerformance: sectors,
                  availableCodes: Object.keys(BIST_INDICES),
                  unknownCodes: unknown.length > 0 ? unknown : undefined,
                  unavailableIndices: notFound.length > 0 ? notFound : undefined,
                  source: "Yahoo Finance",
                  dataNote:
                    "BIST verileri 15 dakika gecikmeli olabilir. Yalnızca doğrulanmış endeks kodları listelenmiştir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Endeks verisi alınamadı: ${msg}`);
      }
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuoteSummary } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface OwnershipRow {
  organization: string | null;
  reportDate: string | null;
  pctHeldPct: number | null;
  position: number | null;
  value: number | null;
  changePct: number | null;
}

export interface OwnershipBreakdown {
  insidersPct: number | null;
  institutionsPct: number | null;
  institutionsFloatPct: number | null;
  institutionsCount: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const pct = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n * 100;
};

/**
 * institutionOwnership / fundOwnership modülünü normalize eder.
 * `pctHeld` ve `pctChange` kesir olarak gelir; yüzdeye çevrilir.
 */
export function normalizeOwnership(raw: any, limit = 10): OwnershipRow[] {
  const list = raw?.ownershipList;
  if (!Array.isArray(list)) return [];

  return list
    .map((o: any) => ({
      organization: str(o?.organization),
      reportDate: isoDate(o?.reportDate),
      pctHeldPct: pct(o?.pctHeld),
      position: num(o?.position),
      value: num(o?.value),
      changePct: pct(o?.pctChange),
    }))
    .sort((a, b) => (b.pctHeldPct ?? 0) - (a.pctHeldPct ?? 0))
    .slice(0, limit);
}

/** majorHoldersBreakdown modülünü normalize eder (oranlar yüzdeye çevrilir). */
export function normalizeOwnershipBreakdown(raw: any): OwnershipBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    insidersPct: pct(raw.insidersPercentHeld),
    institutionsPct: pct(raw.institutionsPercentHeld),
    institutionsFloatPct: pct(raw.institutionsFloatPercentHeld),
    institutionsCount: num(raw.institutionsCount),
  };
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface InstitutionalDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuoteSummary: typeof fetchQuoteSummary;
}

export const DEFAULT_INSTITUTIONAL_DEPS: InstitutionalDeps = {
  resolveTickers,
  fetchQuoteSummary,
};

/**
 * Kurumsal yatırımcıların (fonlar, bankalar, varlık yöneticileri) sahiplik
 * dağılımını ve en büyük pozisyonlarını döndürür.
 */
export function registerGetInstitutionalHolders(
  server: McpServer,
  deps: InstitutionalDeps = DEFAULT_INSTITUTIONAL_DEPS
) {
  server.tool(
    "get_institutional_holders",
    "Bir hissenin kurumsal sahiplik dağılımını döndürür: en büyük kurumlar/fonlar, ellerindeki pay oranı, pozisyon değişimi, insider/kurumsal sahiplik özeti. Örn: AAPL, NVDA, MSFT.",
    {
      symbol: z.string().min(1).describe("Sembol (AAPL, NVDA, MSFT, THYAO.IS)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Her listede gösterilecek kurum sayısı (1-50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, limit }) => {
      const upper = symbol.trim().toUpperCase();

      try {
        const resolved = (await deps.resolveTickers([upper])).get(upper) ?? upper;
        const data = await deps.fetchQuoteSummary(resolved, [
          "institutionOwnership",
          "fundOwnership",
          "majorHoldersBreakdown",
          "price",
        ]);

        const institutions = normalizeOwnership(data.institutionOwnership, limit);
        const funds = normalizeOwnership(data.fundOwnership, limit);
        const breakdown = normalizeOwnershipBreakdown(data.majorHoldersBreakdown);
        const price = data.price ?? {};

        if (!breakdown && institutions.length === 0 && funds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: resolved.replace(/\.IS$/i, ""),
                    name: price.longName ?? price.shortName ?? null,
                    institutions: [],
                    funds: [],
                    message:
                      "Bu sembol için kurumsal sahiplik verisi bulunamadı. Yahoo bu veriyi ağırlıklı olarak ABD şirketleri için sağlar; BIST hisselerinde genellikle boştur.",
                    source: "Yahoo Finance (institutionOwnership)",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol: resolved.replace(/\.IS$/i, ""),
                  name: price.longName ?? price.shortName ?? null,
                  price: num(price.regularMarketPrice),
                  currency: price.currency ?? null,
                  ownershipBreakdown: breakdown
                    ? {
                        insidersPct: round(breakdown.insidersPct),
                        institutionsPct: round(breakdown.institutionsPct),
                        institutionsFloatPct: round(breakdown.institutionsFloatPct),
                        institutionsCount: breakdown.institutionsCount,
                      }
                    : null,
                  topInstitutions: institutions.map((r) => ({
                    ...r,
                    pctHeldPct: round(r.pctHeldPct),
                    changePct: round(r.changePct),
                  })),
                  topFunds: funds.map((r) => ({
                    ...r,
                    pctHeldPct: round(r.pctHeldPct),
                    changePct: round(r.changePct),
                  })),
                  source: "Yahoo Finance (institutionOwnership, fundOwnership)",
                  dataNote:
                    "Sahiplik verileri 13F bildirimlerine dayanır ve gecikmelidir (genellikle çeyreklik). Yatırım tavsiyesi değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Kurumsal sahiplik verisi alınamadı (${upper}): ${msg}`);
      }
    }
  );
}

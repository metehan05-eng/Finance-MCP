import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/fetchWithRetry.js";
import { resolveTickers, fetchQuoteSummary } from "../utils/yahoo.js";
import { round } from "../utils/financeMath.js";

export interface InsiderTrade {
  date: string | null;
  filer: string | null;
  relation: string | null;
  transaction: string | null;
  shares: number | null;
  value: number | null;
  ownership: string | null;
}

export interface InsiderHolder {
  name: string | null;
  relation: string | null;
  latestTransaction: string | null;
  directPosition: number | null;
  indirectPosition: number | null;
  summaryPosition: number | null;
}

export interface NetShareActivity {
  period: string | null;
  buyCount: number | null;
  buyShares: number | null;
  sellCount: number | null;
  sellShares: number | null;
  netCount: number | null;
  netShares: number | null;
  netPercentInsiderSharesPct: number | null;
  totalInsiderShares: number | null;
  netInstitutionalSharesBuying: number | null;
  netInstitutionalBuyingPct: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

/** Yahoo bazen tarihi Date, bazen ISO metin döndürür. */
function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "D"/"I" sahiplik kodunu okunabilir metne çevirir. */
export function ownershipLabel(v: unknown): string | null {
  if (v === "D") return "Direct";
  if (v === "I") return "Indirect";
  return str(v);
}

/**
 * insiderTransactions modülünü normalize eder; en yeni işlem önce olacak şekilde sıralar.
 */
export function normalizeInsiderTransactions(raw: any, limit = 15): InsiderTrade[] {
  const list = raw?.transactions;
  if (!Array.isArray(list)) return [];

  return list
    .map((t: any) => ({
      date: isoDate(t?.startDate),
      filer: str(t?.filerName),
      relation: str(t?.filerRelation),
      transaction: str(t?.transactionText),
      shares: num(t?.shares),
      value: num(t?.value),
      ownership: ownershipLabel(t?.ownership),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

/**
 * insiderHolders modülünü normalize eder; en büyük pozisyon önce olacak şekilde sıralar.
 */
export function normalizeInsiderHolders(raw: any, limit = 10): InsiderHolder[] {
  const list = raw?.holders;
  if (!Array.isArray(list)) return [];

  return list
    .map((h: any) => ({
      name: str(h?.name),
      relation: str(h?.relation),
      latestTransaction: isoDate(h?.latestTransDate),
      directPosition: num(h?.positionDirect),
      indirectPosition: num(h?.positionIndirect),
      summaryPosition: num(h?.positionSummary) ?? num(h?.positionDirect),
    }))
    .sort((a, b) => (b.summaryPosition ?? 0) - (a.summaryPosition ?? 0))
    .slice(0, limit);
}

/** netSharePurchaseActivity modülünü normalize eder (oranlar yüzdeye çevrilir). */
export function normalizeNetActivity(raw: any): NetShareActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const pct = (v: unknown): number | null => (num(v) === null ? null : (num(v) as number) * 100);
  return {
    period: str(raw.period),
    buyCount: num(raw.buyInfoCount),
    buyShares: num(raw.buyInfoShares),
    sellCount: num(raw.sellInfoCount),
    sellShares: num(raw.sellInfoShares),
    netCount: num(raw.netInfoCount),
    netShares: num(raw.netInfoShares),
    netPercentInsiderSharesPct: pct(raw.netPercentInsiderShares),
    totalInsiderShares: num(raw.totalInsiderShares),
    netInstitutionalSharesBuying: num(raw.netInstSharesBuying),
    netInstitutionalBuyingPct: pct(raw.netInstBuyingPercent),
  };
}

/** Test edilebilirlik için dış bağımlılıklar; varsayılanlar gerçek kaynaklardır. */
export interface InsiderDeps {
  resolveTickers: typeof resolveTickers;
  fetchQuoteSummary: typeof fetchQuoteSummary;
}

export const DEFAULT_INSIDER_DEPS: InsiderDeps = { resolveTickers, fetchQuoteSummary };

/**
 * Şirket içi kişilerin (yönetici/ortak) alım-satım işlemlerini ve net alım
 * eğilimini döndürür. Ağırlıklı olarak ABD hisselerinde doludur.
 */
export function registerGetInsiderTransactions(
  server: McpServer,
  deps: InsiderDeps = DEFAULT_INSIDER_DEPS
) {
  server.tool(
    "get_insider_transactions",
    "Şirket içi kişilerin (yöneticiler, yönetim kurulu üyeleri, büyük ortaklar) son alım-satımlarını, net insider alım eğilimini ve insider sahiplik oranını döndürür. Örn: AAPL, NVDA, TSLA.",
    {
      symbol: z.string().min(1).describe("Sembol (AAPL, NVDA, THYAO.IS)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(15)
        .describe("Gösterilecek işlem sayısı (1-50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ symbol, limit }) => {
      const upper = symbol.trim().toUpperCase();

      try {
        const resolved = (await deps.resolveTickers([upper])).get(upper) ?? upper;
        const data = await deps.fetchQuoteSummary(resolved, [
          "insiderTransactions",
          "netSharePurchaseActivity",
          "insiderHolders",
          "majorHoldersBreakdown",
          "price",
        ]);

        const transactions = normalizeInsiderTransactions(data.insiderTransactions, limit);
        const holders = normalizeInsiderHolders(data.insiderHolders, Math.min(limit, 10));
        const netActivity = normalizeNetActivity(data.netSharePurchaseActivity);
        const breakdown = data.majorHoldersBreakdown ?? {};
        const price = data.price ?? {};

        if (transactions.length === 0 && holders.length === 0 && !netActivity) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    symbol: resolved.replace(/\.IS$/i, ""),
                    name: price.longName ?? price.shortName ?? null,
                    insiderTransactions: [],
                    message:
                      "Bu sembol için insider işlem verisi bulunamadı. Yahoo bu veriyi ağırlıklı olarak ABD şirketleri için sağlar; BIST hisselerinde genellikle boştur.",
                    source: "Yahoo Finance (insiderTransactions)",
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
                  exchange: price.exchangeName ?? null,
                  insiderOwnershipPct:
                    num(breakdown.insidersPercentHeld) === null
                      ? null
                      : round((num(breakdown.insidersPercentHeld) as number) * 100),
                  netShareActivity: netActivity
                    ? {
                        ...netActivity,
                        netPercentInsiderSharesPct: round(netActivity.netPercentInsiderSharesPct),
                        netInstitutionalBuyingPct: round(netActivity.netInstitutionalBuyingPct),
                      }
                    : null,
                  recentTransactions: transactions,
                  topInsiderHolders: holders,
                  source: "Yahoo Finance (insiderTransactions, insiderHolders)",
                  dataNote:
                    "Insider işlemleri gecikmeli ve kısmi olabilir; bazı satışlar opsiyon/vergi kaynaklıdır. Tek başına yatırım sinyali değildir.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Insider işlemleri alınamadı (${upper}): ${msg}`);
      }
    }
  );
}

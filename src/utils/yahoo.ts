// yahoo-finance2 v4 singleton yardımcıları.
// Tüm Yahoo tabanlı araçlar aynı örneği paylaşır (rate-limit dostu).
// Ayrıca kısa TTL'li önbellek + yeniden deneme uygulanır.

import { cached as cacheFetch, withRetry } from "./cache.js";

/** Fiyat/kotasyon önbellek TTL'si (saniye). */
const QUOTE_TTL = 60;
/** Geçmiş veri (eski mumlar değişmez) için uzun TTL. */
const HISTORY_TTL = 900;

let cached: any | null = null;

export async function getYahoo(): Promise<any> {
  if (cached) return cached;
  const { default: YahooFinance } = await import("yahoo-finance2");
  cached = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return cached;
}

export interface OhlcRow {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
}

export interface ChartResult {
  symbol: string;
  currency: string | null;
  exchange: string | null;
  quoteType: string | null;
  rows: OhlcRow[];
  events?: ChartEvents | null;
}

/** `chart` çağrısının `events` parametresiyle gelen temettü/ayrım/bölünme verileri. */
export interface ChartEvents {
  dividends?: Array<{ date: string | Date; amount: number }>;
  splits?: Array<{
    date: string | Date;
    numerator: number;
    denominator: number;
    splitRatio: string;
  }>;
}

/**
 * yahoo-finance2 `chart` çağrısının ortak sarmalayıcısı.
 * - period: '1w' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max'
 * - startDate / endDate verilirse period'a göre öncelik alır (YYYY-MM-DD)
 * - interpolation: 'd' | 'wk' | 'mo' | 'h'
 */
export async function fetchOhlc(
  symbol: string,
  opts: {
    period?: string;
    interval?: string;
    startDate?: string;
    endDate?: string;
    events?: "dividends" | "splits" | "capitalGains" | "div" | "earn" | "all";
  } = {}
): Promise<ChartResult> {
  const key = `ohlc:${symbol}:${opts.period ?? "1y"}:${opts.interval ?? "1d"}:${opts.startDate ?? ""}:${opts.endDate ?? ""}:${opts.events ?? ""}`;

  return cacheFetch(
    key,
    opts.startDate || opts.period === "max" ? HISTORY_TTL : QUOTE_TTL,
    async () => {
      const yf = await getYahoo();

      let period1: Date;
      let gMax = false;

      if (opts.startDate) {
        period1 = new Date(opts.startDate);
      } else {
        const p = opts.period ?? "1y";
        if (p === "max") {
          period1 = new Date("1985-01-01");
          gMax = true;
        } else {
          const days = PERIOD_DAYS[p] ?? 365;
          period1 = new Date(Date.now() - days * 86_400_000);
        }
      }

      const period2 = opts.endDate ? new Date(opts.endDate) : new Date();
      const interval = opts.interval ?? "1d";

      const result: any = await withRetry(
        () =>
          yf.chart(symbol, {
            period1,
            period2,
            interval,
            ...(opts.events ? { events: opts.events } : {}),
          }),
        { attempts: 3, label: `chart ${symbol}` }
      );

      const meta: any = result?.meta ?? result?.chart?.result?.[0]?.meta;
      const quotes: any[] =
        result?.quotes ?? result?.chart?.result?.[0]?.indicators?.quote?.[0] ?? [];

      const rows: OhlcRow[] = quotes
        .map((q) => ({
          date:
            q.date instanceof Date
              ? q.date.toISOString()
              : new Date(q.date * 1000 || q.date).toISOString(),
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          close: q.close ?? null,
          adjClose: q.adjclose ?? q.adjClose ?? null,
          volume: q.volume ?? null,
        }))
        .filter((r) => r.close !== null);

      if (gMax && rows.length > 4000) {
        // max veri seti çok büyükse son 4000 günü koru
        rows.splice(0, rows.length - 4000);
      }

      return {
        symbol: meta?.symbol ?? symbol,
        currency: meta?.currency ?? null,
        exchange: meta?.exchangeName ?? meta?.fullExchangeName ?? null,
        quoteType: meta?.instrumentType ?? meta?.quoteType ?? null,
        rows,
        events: result?.events ?? null,
      } as ChartResult;
    }
  );
}
export const PERIOD_DAYS: Record<string, number> = {
  "1w": 7,
  "1mo": 30,
  "3mo": 92,
  "6mo": 183,
  "1y": 366,
  "2y": 731,
  "5y": 1827,
};

/**
 * Birden fazla sembolün anlık kotasyonunu tek çağrıda alır.
 * Kısa TTL önbellek + jitter'lı yeniden deneme ile Yahoo'nun geçici
 * zaman aşımı / 429 hatalarına dayanıklıdır.
 */
export async function fetchQuotes(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  const yf = await getYahoo();
  const key = `quotes:${[...symbols].sort().join(",")}`;
  return cacheFetch(key, QUOTE_TTL, async () => {
    const result: any = await withRetry(() => yf.quote(symbols), {
      attempts: 3,
      label: `quote ${symbols.length} sembol`,
    });
    return Array.isArray(result) ? result : [result];
  });
}

/**
 * Tek sembolün anlık kotasyonu.
 */
export async function fetchQuote(symbol: string): Promise<any> {
  const yf = await getYahoo();
  const key = `quote:${symbol}`;
  return cacheFetch(key, QUOTE_TTL, async () => {
    const result: any = await withRetry(() => yf.quote(symbol), {
      attempts: 3,
      label: `quote ${symbol}`,
    });
    return Array.isArray(result) ? result[0] : result;
  });
}

/**
 * Sembol araması.
 */
export async function searchSymbols(query: string, quotesCount = 8) {
  const yf = await getYahoo();
  const key = `search:${query}:${quotesCount}`;
  return cacheFetch(key, QUOTE_TTL, async () => {
    const result: any = await withRetry(() => yf.search(query, { quotesCount, newsCount: 0 }), {
      attempts: 2,
      label: `search ${query}`,
    });
    return result?.quotes ?? [];
  });
}

/**
 * quoteSummary modül çağrısı (önbellekli + yeniden denemeli).
 * `modules` verilmezse çağrı yapılmaz.
 */
export async function fetchQuoteSummary(
  symbol: string,
  modules: string[]
): Promise<Record<string, any>> {
  const yf = await getYahoo();
  const key = `qs:${symbol}:${[...modules].sort().join(",")}`;
  return cacheFetch(key, QUOTE_TTL, async () => {
    const result: any = await withRetry(() => yf.quoteSummary(symbol, { modules }), {
      attempts: 3,
      label: `quoteSummary ${symbol}`,
    });
    return result ?? {};
  });
}

/**
 * Önce doğrudan (küresel), sonuç yoksa BIST (`.IS`) uzantısıyla dener.
 * Tek denemenin başarısızlığı diğer denemeyi engellemez.
 */
export async function tryBoth(
  input: string,
  period: string,
  interval = "1d",
  startDate?: string,
  endDate?: string
): Promise<ChartResult> {
  let direct: ChartResult | null = null;
  try {
    direct = await fetchOhlc(input, { period, interval, startDate, endDate });
  } catch {
    /* doğrudan sembol geçersiz olabilir */
  }

  if (direct && direct.rows.length > 0 && !input.toUpperCase().endsWith(".IS")) {
    return direct;
  }

  try {
    const breve = input.toUpperCase().endsWith(".IS") ? input : `${input}.IS`;
    const bist = await fetchOhlc(breve, { period, interval, startDate, endDate });
    if (bist.rows.length > 0) return bist;
  } catch {
    /* BIST denemesi de başarısız olabilir */
  }

  if (direct) return direct;
  throw new Error("Sembol bulunamadı");
}

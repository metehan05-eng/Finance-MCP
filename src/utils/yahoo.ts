/* eslint-disable @typescript-eslint/no-explicit-any */

// yahoo-finance2 v4 singleton yardımcıları.
// Tüm Yahoo tabanlı araçlar aynı örneği paylaşır (rate-limit dostu).

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
  } = {}
): Promise<ChartResult> {
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

  const result: any = await yf.chart(symbol, {
    period1,
    period2,
    interval,
  });

  const meta: any = result?.meta ?? result?.chart?.result?.[0]?.meta;
  const quotes: any[] = result?.quotes ?? result?.chart?.result?.[0]?.indicators?.quote?.[0] ?? [];

  const rows: OhlcRow[] = quotes
    .map((q) => ({
      date: q.date instanceof Date ? q.date.toISOString() : new Date(q.date * 1000 || q.date).toISOString(),
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
  };
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
 * Yahoo geçici ağ hatalarına karşı bir kez yeniden dener.
 */
export async function fetchQuotes(symbols: string[]): Promise<any[]> {
  const yf = await getYahoo();
  let result: any;
  try {
    result = await yf.quote(symbols);
  } catch {
    result = await yf.quote(symbols);
  }
  return Array.isArray(result) ? result : [result];
}

/**
 * Tek sembolün anlık kotasyonu.
 */
export async function fetchQuote(symbol: string): Promise<any> {
  const yf = await getYahoo();
  let result: any;
  try {
    result = await yf.quote(symbol);
  } catch {
    result = await yf.quote(symbol);
  }
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Sembol araması.
 */
export async function searchSymbols(query: string, quotesCount = 8) {
  const yf = await getYahoo();
  const result = await yf.search(query, { quotesCount, newsCount: 0 });
  return result?.quotes ?? [];
}
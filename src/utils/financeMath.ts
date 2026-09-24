/**
 * Finansal matematik yardımcıları — tarihsel fiyatlardan getiri,
 * volatilite, korelasyon ve portföy istatistiği hesaplar.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const sqDiff = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(sqDiff / (xs.length - (sample ? 1 : 0)));
}

export function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (xs[i] - mx) * (ys[i] - my);
  return sum / (n - 1);
}

/**
 * Pearson korelasyon katsayısı [-1, 1].
 */
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const sx = stdev(xs.slice(0, n));
  const sy = stdev(ys.slice(0, n));
  if (sx === 0 || sy === 0) return 0;
  return covariance(xs, ys) / (sx * sy);
}

/**
 * Bir fiyat dizisinden günlük (basit) getiri yüzdelerini hesaplar.
 */
export function priceToReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] && prices[i]) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

/**
 * Günlük getirilerden yıllıklandırılmış getiri (bileşik).
 */
export function annualizedReturn(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const total = dailyReturns.reduce((a, b) => a * (1 + b), 1);
  const n = dailyReturns.length;
  return Math.pow(total, 252 / n) - 1;
}

/**
 * Günlük getirilerden yıllıklandırılmış volatilite (std dev, %).
 */
export function annualizedVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  return stdev(dailyReturns) * Math.sqrt(252);
}

/**
 * Türkçe sayı formatını (örn. "1,650,074" veya "16382,0000") sayıya çevirir.
 */
export function parseTrNumber(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s.trim() === "" || s.trim() === "-") return null;
  const cleaned = s.replace(/[^\d,.\-]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    // bindelik ayracı "." veya "," olabilir; sonuncu virgül ondalıktır
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

export function round(n: number | null | undefined, digits = 2): number | null {
  if (n === null || n === undefined || isNaN(n)) return null;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * İki fiyat serisini tarih (YYYY-MM-DD) üzerinden hizalar, kapanışları döndürür.
 */
export function alignByDate(
  pricesA: Array<{ date: string; close: number }>,
  pricesB: Array<{ date: string; close: number }>
): { xs: number[]; ys: number[] } {
  const mapB = new Map(pricesB.map((p) => [p.date, p.close]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of pricesA) {
    const b = mapB.get(p.date);
    if (b !== undefined) {
      xs.push(p.close);
      ys.push(b);
    }
  }
  return { xs, ys };
}
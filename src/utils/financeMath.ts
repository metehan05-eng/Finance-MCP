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
 * Getirilerden yıllıklandırılmış getiri (bileşik).
 * `periodsPerYear` getiri periyoduna göre ayarlanır: 252 (günlük), 52 (haftalık), 12 (aylık).
 */
export function annualizedReturn(dailyReturns: number[], periodsPerYear = 252): number {
  if (dailyReturns.length < 2) return 0;
  const total = dailyReturns.reduce((a, b) => a * (1 + b), 1);
  const n = dailyReturns.length;
  return Math.pow(total, periodsPerYear / n) - 1;
}

/**
 * Getirilerden yıllıklandırılmış volatilite (std dev).
 * `periodsPerYear` getiri periyoduna göre ayarlanır: 252 (günlük), 52 (haftalık), 12 (aylık).
 */
export function annualizedVolatility(dailyReturns: number[], periodsPerYear = 252): number {
  if (dailyReturns.length < 2) return 0;
  return stdev(dailyReturns) * Math.sqrt(periodsPerYear);
}

/**
 * Metindeki sayıyı çözer. Türkçe (1.234,56) ve İngilizce (1,234.56) biçimler
 * desteklenir; hangi ayracın ondalık olduğu son görülen ayraca göre belirlenir.
 * Aynı ayraç birden fazla görünüyorsa binlik ayraç kabul edilir (1.650.074,
 * 1,650,074 → 1650074). Örnek: "16382,0000" → 16382.
 */
export function parseTrNumber(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s.trim() === "" || s.trim() === "-") return null;
  const cleaned = s.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 → virgül ondalık, nokta binlik
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 → nokta ondalık, virgül binlik
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    normalized =
      cleaned.split(",").length > 2 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (lastDot !== -1) {
    // birden fazla nokta kesin binlik; tek nokta olduğu gibi bırakılır (ondalık)
    if (cleaned.split(".").length > 2) normalized = cleaned.replace(/\./g, "");
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
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

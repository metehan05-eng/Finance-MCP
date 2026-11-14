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
 * Sıralanmış kopya üzerinde p (0-1) yüzdeliğini doğrusal interpolasyonla döndürür.
 * Boş seride 0 döner.
 */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Getirilerin çarpıklığı (population skewness). 3'ten az gözlemde 0. */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const m2 = xs.reduce((s, x) => s + (x - m) ** 2, 0) / n;
  const m3 = xs.reduce((s, x) => s + (x - m) ** 3, 0) / n;
  if (m2 === 0) return 0;
  return m3 / Math.pow(m2, 1.5);
}

/** Getirilerin fazla basıklığı (excess kurtosis). 4'ten az gözlemde 0. */
export function kurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  const m2 = xs.reduce((s, x) => s + (x - m) ** 2, 0) / n;
  const m4 = xs.reduce((s, x) => s + (x - m) ** 4, 0) / n;
  if (m2 === 0) return 0;
  return m4 / (m2 * m2) - 3;
}

/**
 * Aşağı yönlü sapma (downside deviation): hedefin altındaki getirilerin
 * karelerinin ortalamasının karekökü. Sortino oranında kullanılır.
 */
export function downsideDeviation(xs: number[], target = 0): number {
  if (xs.length === 0) return 0;
  const sq = xs.reduce((s, x) => s + (x < target ? (x - target) ** 2 : 0), 0);
  return Math.sqrt(sq / xs.length);
}

export interface DrawdownInfo {
  /** Maksimum düşüş (negatif kesir, örn. -0.25 = %25 düşüş). */
  maxDrawdown: number;
  /** Zirvenin serideki indeksi (-1 = seri boş). */
  peakIndex: number;
  /** Dip noktasının indeksi. */
  troughIndex: number;
  /** Zirve seviyesine ilk geri dönüş indeksi (yoksa null). */
  recoveryIndex: number | null;
}

/**
 * Bir değer serisindeki (fiyat/portföy değeri) en büyük tepe-dip düşüşünü bulur.
 */
export function maxDrawdown(values: number[]): DrawdownInfo {
  if (values.length === 0) {
    return { maxDrawdown: 0, peakIndex: -1, troughIndex: -1, recoveryIndex: null };
  }

  let peak = values[0];
  let peakIdx = 0;
  let maxDd = 0;
  let bestPeak = 0;
  let bestTrough = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
    }
    const dd = peak === 0 ? 0 : values[i] / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      bestPeak = peakIdx;
      bestTrough = i;
    }
  }

  let recoveryIndex: number | null = null;
  if (maxDd < 0) {
    const peakValue = values[bestPeak];
    for (let i = bestTrough + 1; i < values.length; i++) {
      if (values[i] >= peakValue) {
        recoveryIndex = i;
        break;
      }
    }
  }

  return { maxDrawdown: maxDd, peakIndex: bestPeak, troughIndex: bestTrough, recoveryIndex };
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

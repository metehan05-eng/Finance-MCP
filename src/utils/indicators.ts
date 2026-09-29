/**
 * Teknik analiz indikatörleri — saf fonksiyonlar.
 * Tüm dizi tabanlı fonksiyonlar girişle aynı uzunlukta dizi döndürür;
 * yeterli geçmişi olmayan konumlarda `null` vardır.
 */

export type NullableNumber = number | null;

/** Basit hareketli ortalama (SMA). */
export function sma(values: number[], period: number): NullableNumber[] {
  const out: NullableNumber[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Üstel hareketli ortalama (EMA). */
export function ema(values: number[], period: number): NullableNumber[] {
  const out: NullableNumber[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI (Wilder yumuşatması, varsayılan 14 periyot). */
export function rsi(values: number[], period = 14): NullableNumber[] {
  const out: NullableNumber[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  const toRsi = (avgGain: number, avgLoss: number): number =>
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = toRsi(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: NullableNumber[];
  signal: NullableNumber[];
  histogram: NullableNumber[];
}

/** MACD (12/26/9). Diğer satırlarla yeniden hizalanır. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const n = values.length;
  const macdLine: NullableNumber[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = (emaFast[i] as number) - (emaSlow[i] as number);
    }
  }

  // signal = macd hatlarının EMA'sı (null'ları yok sayarak)
  const raw = macdLine.filter((v): v is number => v !== null);
  const rawSignal = ema(raw, signalPeriod);
  const signal: NullableNumber[] = new Array(n).fill(null);
  const histogram: NullableNumber[] = new Array(n).fill(null);
  let rawIdx = 0;
  for (let i = 0; i < n; i++) {
    if (macdLine[i] !== null) {
      signal[i] = rawSignal[rawIdx];
      histogram[i] = (macdLine[i] as number) - (rawSignal[rawIdx] ?? 0);
      if (rawSignal[rawIdx] === null) histogram[i] = null;
      rawIdx++;
    }
  }
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: NullableNumber[];
  middle: NullableNumber[];
  lower: NullableNumber[];
}

/** Bollinger bantları (20, 2σ). */
export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const n = values.length;
  const upper: NullableNumber[] = new Array(n).fill(null);
  const middle: NullableNumber[] = new Array(n).fill(null);
  const lower: NullableNumber[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    middle[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { upper, middle, lower };
}

/** ATR (Wilder yumuşatması) — gerçek aralık ortalaması. */
export function atr(high: number[], low: number[], close: number[], period = 14): NullableNumber[] {
  const n = Math.min(high.length, low.length, close.length);
  const out: NullableNumber[] = new Array(n).fill(null);
  if (n <= period) return out;

  const tr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = high[i] - low[i];
    } else {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
  }

  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** RSI için genel yorumlama. */
export function rsiInterpretation(v: number | null): string {
  if (v === null) return "yeterli veri yok";
  if (v >= 70) return "aşırı alım (overbought)";
  if (v <= 30) return "aşırı satım (oversold)";
  if (v >= 50) return "pozitif ivme";
  return "negatif ivme";
}

/** Fiyatın Bollinger bantlarına göre konumu. */
export function bollingerPosition(
  price: number,
  upper: number | null,
  lower: number | null
): string {
  if (upper === null || lower === null) return "veri yok";
  if (price >= upper) return "üst banda değdi/bant dışı (güçlü)";
  if (price <= lower) return "alt banda değdi/bant dışı (zayıf)";
  const midPos = (price - lower) / (upper - lower);
  if (midPos >= 0.8) return "üst bölgede";
  if (midPos <= 0.2) return "alt bölgede";
  return "orta bölgede";
}

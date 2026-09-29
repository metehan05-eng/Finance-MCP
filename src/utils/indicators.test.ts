import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  atr,
  rsiInterpretation,
  bollingerPosition,
} from "./indicators.js";

const closeTo = (actual: number | null | undefined, expected: number, tol = 1e-6) =>
  assert.ok(
    actual !== null && actual !== undefined && Math.abs(actual - expected) < tol,
    `beklenen ${expected}, gelen ${actual}`
  );

test("sma: periyottan önce null, sonra kayan ortalama", () => {
  const out = sma([1, 2, 3, 4, 5], 3);
  assert.deepEqual(out.slice(0, 2), [null, null]);
  closeTo(out[2], 2);
  closeTo(out[3], 3);
  closeTo(out[4], 4);
  assert.ok(
    sma([1, 2], 5).every((v) => v === null),
    "yetersiz veri → tümü null"
  );
});

test("ema: ilk değer SMA, sonrası k ile ilerler", () => {
  const out = ema([1, 2, 3, 4, 5], 3);
  assert.equal(out[1], null, "periyottan önce null");
  closeTo(out[2], 2);
  // k = 2/(3+1) = 0.5 → 4*0,5 + 2*0,5 = 3
  closeTo(out[3], 3);
  closeTo(out[4], 4);
});

test("rsi: sürekli yükselişte 100, sürekli düşüşte 0", () => {
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
  const outUp = rsi(rising, 14);
  assert.equal(outUp[13], null, "ilk 14 noktada RSI hesaplanmaz");
  closeTo(outUp[29], 100);

  const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
  const outDown = rsi(falling, 14);
  closeTo(outDown[29], 0);
});

test("rsi: klasik örnek (Wilder) ~70", () => {
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
    46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
  ];
  const out = rsi(closes, 14);
  assert.ok(
    out[14] !== null && out[14]! > 65 && out[14]! < 75,
    `14. gün RSI ~70 olmalı, gelen ${out[14]}`
  );
});

test("macd: sabit seride sıfır, sinyal gecikmeli hizalanır", () => {
  const flat = new Array(60).fill(50);
  const m = macd(flat);
  closeTo(m.macd[59], 0);
  closeTo(m.signal[59], 0);
  closeTo(m.histogram[59], 0);

  const rising = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5);
  const r = macd(rising);
  assert.ok(r.macd[59] !== null, "yükselen seride MACD hesaplanmalı");
  assert.ok((r.macd[59] as number) > 0, "yükselen trendde MACD pozitif olmalı");
  assert.equal(r.macd.length, rising.length, "dizi uzunluğu girişle aynı");
});

test("bollinger: sabit seride bantlar eşit, üst>orta>alt", () => {
  const flat = new Array(30).fill(10);
  const b = bollinger(flat, 20, 2);
  closeTo(b.middle[29], 10);
  closeTo(b.upper[29], 10);
  closeTo(b.lower[29], 10);
  assert.equal(b.upper[5], null, "periyottan önce null");

  const noisy = Array.from({ length: 40 }, (_, i) => 10 + (i % 2 === 0 ? 1 : -1));
  const n = bollinger(noisy, 20, 2);
  assert.ok((n.upper[39] as number) > (n.middle[39] as number));
  assert.ok((n.middle[39] as number) > (n.lower[39] as number));
});

test("atr: sabit genişlikte aralık değerine yakınsar", () => {
  const n = 40;
  const high = new Array(n).fill(11);
  const low = new Array(n).fill(9);
  const close = new Array(n).fill(10);
  const out = atr(high, low, close, 14);
  closeTo(out[n - 1], 2, 1e-9);
});

test("yorum yardımcıları", () => {
  assert.match(rsiInterpretation(75), /aşırı alım/);
  assert.match(rsiInterpretation(10), /aşırı satım/);
  assert.equal(rsiInterpretation(null), "yeterli veri yok");
  assert.match(bollingerPosition(105, 104, 96), /üst/);
  assert.match(bollingerPosition(95, 104, 96), /alt/);
  assert.equal(bollingerPosition(100, null, null), "veri yok");
});

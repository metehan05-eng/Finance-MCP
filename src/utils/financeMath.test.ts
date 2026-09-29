import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mean,
  stdev,
  covariance,
  correlation,
  priceToReturns,
  annualizedReturn,
  annualizedVolatility,
  parseTrNumber,
  round,
  alignByDate,
} from "./financeMath.js";

const close = (actual: number | null | undefined, expected: number, tol = 1e-6, msg?: string) =>
  assert.ok(
    actual !== null && actual !== undefined && Math.abs(actual - expected) < tol,
    msg ?? `beklenen ${expected}, gelen ${actual}`
  );

test("mean: boş listede 0, normal listede aritmetik ortalama", () => {
  assert.equal(mean([]), 0);
  close(mean([1, 2, 3, 4]), 2.5);
});

test("stdev: örneklem sapması", () => {
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2.13809);
  close(stdev([1, 1, 1, 1]), 0);
  assert.equal(stdev([5]), 0);
});

test("covariance ve correlation: mükemmel pozitif/negatif ilişki", () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10];
  // örneklem kovaryansı: Σ(x-x̄)(y-ȳ)/(n-1) = 20/4
  close(covariance(a, b), 5);
  close(correlation(a, b), 1);
  close(correlation(a, [10, 8, 6, 4, 2]), -1);
  assert.equal(correlation(a, [5, 5, 5, 5, 5]), 0, "sabit seri korelasyonu tanımsız");
});

test("priceToReturns: yüzdelik getiriler", () => {
  const r = priceToReturns([100, 110, 99]);
  close(r[0], 0.1);
  close(r[1], -0.1);
});

test("annualizedReturn: günlük getirileri yıllıklaştırır", () => {
  // 252 günün her biri %0,04 → toplam ≈ %10,57 yıllık
  const daily = new Array(252).fill(0.0004);
  close(annualizedReturn(daily), 0.1057, 0.001);
  assert.equal(annualizedReturn([0.05]), 0, "tek gün yıllıklaştırılamaz");
  assert.equal(annualizedReturn([]), 0);
});

test("annualizedVolatility: günlük sapma * sqrt(252)", () => {
  const r = [0.01, -0.01, 0.01, -0.01];
  close(annualizedVolatility(r), stdev(r) * Math.sqrt(252));
  assert.equal(annualizedVolatility([0.01]), 0);
});

test("parseTrNumber: Türkçe sayı biçimleri", () => {
  close(parseTrNumber("16382,0000")!, 16382);
  close(parseTrNumber("%1,25")!, 1.25);
  close(parseTrNumber("1.234,56")!, 1234.56);
  assert.equal(parseTrNumber("-"), null, "tire (veri yok) null döner");
  assert.equal(parseTrNumber(""), null);
  assert.equal(parseTrNumber(null), null);
});

test("round: null geçer, ondalık yuvarlar", () => {
  assert.equal(round(null), null);
  assert.equal(round(1.23456), 1.23);
  close(round(1.23456, 3)!, 1.235);
});

test("alignByDate: ortak tarihleri eşleştirir", () => {
  const { xs, ys } = alignByDate(
    [
      { date: "2024-01-01", close: 1 },
      { date: "2024-01-02", close: 2 },
      { date: "2024-01-03", close: 3 },
    ],
    [
      { date: "2024-01-02", close: 20 },
      { date: "2024-01-03", close: 30 },
    ]
  );
  assert.deepEqual(xs, [2, 3]);
  assert.deepEqual(ys, [20, 30]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMonthlyCloses,
  computeSeasonality,
  MONTH_LABELS_TR,
  type MonthlyClose,
} from "./getSeasonality.js";

const close = (actual: number | null | undefined, expected: number, tol = 1e-6) =>
  assert.ok(
    actual !== null && actual !== undefined && Math.abs(actual - expected) < tol,
    `beklenen ${expected}, gelen ${actual}`
  );

test("aggregateMonthlyCloses: her ayın son kapanışını alır ve sıralar", () => {
  const monthly = aggregateMonthlyCloses([
    { date: "2024-01-31", close: 120 },
    { date: "2024-01-02", close: 100 },
    { date: "2024-02-29", close: 130 },
    { date: "2023-12-29", close: 90 },
    { date: "2024-03-01", close: null },
  ]);

  assert.deepEqual(monthly, [
    { month: "2023-12", close: 90 },
    { month: "2024-01", close: 120 },
    { month: "2024-02", close: 130 },
  ]);
});

test("computeSeasonality: ay bazlı ortalama, pozitif oran ve boşluk atlama", () => {
  const monthly: MonthlyClose[] = [
    { month: "2023-12", close: 100 },
    { month: "2024-01", close: 110 },
    { month: "2024-02", close: 99 },
    { month: "2024-12", close: 120 },
    { month: "2025-01", close: 132 },
    { month: "2025-02", close: 118.8 },
  ];

  const stats = computeSeasonality(monthly);
  assert.equal(stats.length, 12);
  assert.deepEqual(
    stats.map((s) => s.label),
    [...MONTH_LABELS_TR]
  );

  const jan = stats[0];
  assert.equal(jan.years, 2);
  close(jan.avgReturnPct, 10);
  close(jan.positiveRatePct, 100);
  close(jan.bestPct, 10);

  const feb = stats[1];
  assert.equal(feb.years, 2);
  close(feb.avgReturnPct, -10);
  close(feb.positiveRatePct, 0);

  const dec = stats[11];
  assert.equal(dec.years, 0);
  assert.equal(dec.avgReturnPct, null);

  const mar = stats[2];
  assert.equal(mar.years, 0, "veri boşluğu olan aylar atlanır");
});

test("computeSeasonality: boş seride tüm aylar boş", () => {
  const stats = computeSeasonality([]);
  assert.equal(stats.length, 12);
  assert.ok(stats.every((s) => s.years === 0 && s.avgReturnPct === null));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupDividendsByYear, trailingDividendYield } from "./getDividendHistory.js";

const iso = (d: Date) => d.toISOString();

test("groupDividendsByYear: yıllara göre toplar, en yeni yıl önce", () => {
  const rows = groupDividendsByYear([
    { date: "2024-03-29T00:00:00.000Z", amount: 3.11 },
    { date: "2024-09-30T00:00:00.000Z", amount: 2.5 },
    { date: "2025-04-10T00:00:00.000Z", amount: 6.0 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].year, 2025);
  assert.equal(rows[0].total, 6);
  assert.equal(rows[0].payments, 1);
  assert.equal(rows[1].year, 2024);
  assert.equal(rows[1].total, 5.61);
  assert.equal(rows[1].payments, 2);
});

test("groupDividendsByYear: boş girdi", () => {
  assert.deepEqual(groupDividendsByYear([]), []);
});

test("trailingDividendYield: son 12 ay toplamı / fiyat", () => {
  const now = Date.now();
  const within = iso(new Date(now - 100 * 86_400_000));
  const old = iso(new Date(now - 500 * 86_400_000));

  // 100 gün önce 2 TL + 200 gün önce 1 TL = 3 TL / 100 TL = %3
  const y = trailingDividendYield(
    [
      { date: within, amount: 2 },
      { date: within, amount: 1 },
      { date: old, amount: 50 },
    ],
    100
  );
  assert.equal(y, 3);
});

test("trailingDividendYield: 12 aydan eski temettüler sayılmaz", () => {
  const old = iso(new Date(Date.now() - 500 * 86_400_000));
  assert.equal(trailingDividendYield([{ date: old, amount: 50 }], 100), null);
});

test("trailingDividendYield: geçersiz fiyat veya temettü yoksa null", () => {
  assert.equal(trailingDividendYield([{ date: iso(new Date()), amount: 5 }], null), null);
  assert.equal(trailingDividendYield([{ date: iso(new Date()), amount: 5 }], 0), null);
  assert.equal(trailingDividendYield([], 100), null);
});

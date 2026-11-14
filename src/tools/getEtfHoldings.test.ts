import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTopHoldings,
  normalizeSectorWeights,
  normalizeEtfProfile,
  normalizeTrailingReturns,
  prettySector,
} from "./getEtfHoldings.js";

const close = (actual: number | null, expected: number, tol = 1e-9) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < tol,
    `beklenen ${expected}, gelen ${actual}`
  );

test("normalizeTopHoldings: ağırlığı yüzdeye çevirir ve sıralar", () => {
  const rows = normalizeTopHoldings(
    {
      holdings: [
        { symbol: "B", holdingName: "B Inc", holdingPercent: 0.02 },
        { symbol: "A", holdingName: "A Inc", holdingPercent: 0.077 },
      ],
    },
    1
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "A");
  assert.equal(rows[0].weightPct, 7.7);
  assert.equal(rows[0].name, "A Inc");
});

test("normalizeSectorWeights: sektör anahtarlarını birleştirir ve sıralar", () => {
  const rows = normalizeSectorWeights([
    { technology: 0.28, healthcare: 0.1 },
    { technology: 0.02, energy: 0.05 },
  ]);

  assert.equal(rows[0].sector, "Technology");
  close(rows[0].weightPct, 30);
  assert.equal(rows[1].sector, "Healthcare");
  close(rows[1].weightPct, 10);
  assert.equal(rows[2].sector, "Energy");
  close(rows[2].weightPct, 5);
  assert.deepEqual(normalizeSectorWeights(undefined), []);
});

test("prettySector: snake_case'i okunabilir hale getirir", () => {
  assert.equal(prettySector("consumer_cyclical"), "Consumer Cyclical");
  assert.equal(prettySector("realestate"), "Realestate");
});

test("normalizeEtfProfile: gider oranını yüzdeye çevirir", () => {
  const p = normalizeEtfProfile({
    categoryName: "Large Blend",
    legalType: "Exchange Traded Fund",
    family: "SPDR",
    feesExpensesInvestment: {
      annualReportExpenseRatio: 0.000945,
      annualHoldingsTurnover: 0.03,
    },
  });

  assert.ok(p);
  assert.equal(p.category, "Large Blend");
  assert.equal(p.legalType, "Exchange Traded Fund");
  assert.ok(Math.abs((p.netExpenseRatioPct as number) - 0.0945) < 1e-9);
  assert.equal(p.annualHoldingsTurnoverPct, 3);
  assert.equal(normalizeEtfProfile(null), null);
});

test("normalizeTrailingReturns: kesirleri yüzdeye çevirir", () => {
  const r = normalizeTrailingReturns({
    ytd: 0.1168,
    oneMonth: -0.0087,
    oneYear: 0.1201,
    threeYear: 0.2326,
  });
  assert.ok(r);
  close(r.ytdPct, 11.68);
  close(r.oneMonthPct, -0.87);
  close(r.threeYearPct, 23.26);
  assert.equal(r.fiveYearPct, null);
  assert.equal(normalizeTrailingReturns(null), null);
});

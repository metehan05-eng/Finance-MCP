import test from "node:test";
import assert from "node:assert/strict";
import { computeRiskMetrics } from "./getRiskMetrics.js";

const close = (actual: number | null | undefined, expected: number, tol = 1e-6) =>
  assert.ok(
    actual !== null && actual !== undefined && Math.abs(actual - expected) < tol,
    `beklenen ${expected}, gelen ${actual}`
  );

const dates = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
const closes = [100, 110, 99, 120, 130];

test("computeRiskMetrics: getiri ve maksimum düşüş", () => {
  const m = computeRiskMetrics({
    dates,
    closes,
    periodsPerYear: 252,
    riskFreeRate: 5,
    confidence: 95,
  });

  assert.equal(m.observations, 4);
  assert.equal(m.startDate, "2024-01-01");
  assert.equal(m.endDate, "2024-01-05");
  close(m.totalReturnPct, 30);
  close(m.maxDrawdown.pct, -10);
  assert.equal(m.maxDrawdown.peakDate, "2024-01-02");
  assert.equal(m.maxDrawdown.troughDate, "2024-01-03");
  assert.equal(m.maxDrawdown.recoveryDate, "2024-01-04");
  close(m.bestPeriodPct, (120 / 99 - 1) * 100);
  close(m.worstPeriodPct, -10);
  close(m.positivePeriodsPct, 75);
});

test("computeRiskMetrics: tarihsel VaR ve CVaR", () => {
  const m = computeRiskMetrics({
    dates,
    closes,
    periodsPerYear: 252,
    riskFreeRate: 5,
    confidence: 95,
  });

  assert.equal(m.valueAtRisk.confidence, 95);
  assert.ok(m.valueAtRisk.perPeriodLossPct > 0);
  assert.ok(m.valueAtRisk.cvarLossPct >= m.valueAtRisk.perPeriodLossPct);
  close(m.valueAtRisk.cvarLossPct, 10);
});

test("computeRiskMetrics: tek gözlemli seride güvenli", () => {
  const m = computeRiskMetrics({
    dates: ["2024-01-01"],
    closes: [100],
    periodsPerYear: 252,
    riskFreeRate: 5,
    confidence: 95,
  });
  assert.equal(m.observations, 0);
  close(m.totalReturnPct, 0);
  close(m.annualVolatilityPct, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildRebalancingPlan } from "./getRebalancingPlan.js";

const close = (actual: number, expected: number, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tol, `beklenen ${expected}, gelen ${actual}`);

test("buildRebalancingPlan: dengeli portföyde işlem yok", () => {
  const plan = buildRebalancingPlan(
    [
      { symbol: "A", value: 600 },
      { symbol: "B", value: 400 },
    ],
    [
      { symbol: "A", weightPct: 60 },
      { symbol: "B", weightPct: 40 },
    ]
  );

  assert.equal(plan.totalValue, 1000);
  assert.ok(plan.rows.every((r) => r.action === "HOLD"));
  assert.ok(plan.rows.every((r) => Math.abs(r.difference) < 1e-9));
});

test("buildRebalancingPlan: hedef değişince al/sat tutarları", () => {
  const plan = buildRebalancingPlan(
    [
      { symbol: "A", value: 600 },
      { symbol: "B", value: 400 },
    ],
    [
      { symbol: "A", weightPct: 70 },
      { symbol: "B", weightPct: 30 },
    ]
  );

  const a = plan.rows.find((r) => r.symbol === "A")!;
  const b = plan.rows.find((r) => r.symbol === "B")!;

  assert.equal(a.action, "BUY");
  close(a.targetValue, 700);
  close(a.difference, 100);
  assert.equal(b.action, "SELL");
  close(b.difference, -100);
});

test("buildRebalancingPlan: yeni pozisyon ve tam çıkış", () => {
  const plan = buildRebalancingPlan(
    [
      { symbol: "A", value: 500 },
      { symbol: "B", value: 500 },
    ],
    [
      { symbol: "A", weightPct: 40 },
      { symbol: "B", weightPct: 40 },
      { symbol: "C", weightPct: 20 },
    ]
  );

  const c = plan.rows.find((r) => r.symbol === "C")!;
  assert.equal(c.currentValue, 0);
  assert.equal(c.targetValue, 200);
  assert.equal(c.action, "BUY");
  assert.ok(plan.warnings.some((w) => w.includes("Yeni pozisyon: C")));

  const exitPlan = buildRebalancingPlan(
    [{ symbol: "A", value: 100 }],
    [{ symbol: "A", weightPct: 50 }]
  );
  assert.ok(!exitPlan.warnings.some((w) => w.includes("Tamamen çıkış")), "A hedefte var");
});

test("buildRebalancingPlan: ağırlıkları normalize eder ve uyarır", () => {
  const plan = buildRebalancingPlan(
    [
      { symbol: "A", value: 500 },
      { symbol: "B", value: 500 },
    ],
    [
      { symbol: "A", weightPct: 70 },
      { symbol: "B", weightPct: 20 },
    ]
  );

  const a = plan.rows.find((r) => r.symbol === "A")!;
  const b = plan.rows.find((r) => r.symbol === "B")!;
  close(a.targetWeightPct, 700 / 9);
  close(b.targetWeightPct, 200 / 9);
  assert.ok(plan.warnings.some((w) => w.includes("normalize")));
});

test("buildRebalancingPlan: nakit toplam değere dahil edilir", () => {
  const plan = buildRebalancingPlan(
    [{ symbol: "A", value: 1000 }],
    [
      { symbol: "A", weightPct: 50 },
      { symbol: "B", weightPct: 50 },
    ],
    1000
  );
  assert.equal(plan.totalValue, 2000);
  const a = plan.rows.find((r) => r.symbol === "A")!;
  const b = plan.rows.find((r) => r.symbol === "B")!;
  assert.equal(a.action, "HOLD");
  close(b.difference, 1000);
  assert.ok(plan.warnings.some((w) => w.includes("nakit")));
});

test("buildRebalancingPlan: geçersiz hedefte boş plan", () => {
  const plan = buildRebalancingPlan([{ symbol: "A", value: 100 }], []);
  assert.deepEqual(plan.rows, []);
  assert.ok(plan.warnings.length > 0);
});

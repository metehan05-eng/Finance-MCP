import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOwnership, normalizeOwnershipBreakdown } from "./getInstitutionalHolders.js";

test("normalizeOwnership: yüzdeleri çevirir, sıralar ve limitler", () => {
  const rows = normalizeOwnership(
    {
      ownershipList: [
        {
          organization: "Küçük Fon",
          reportDate: "2024-06-30T00:00:00.000Z",
          pctHeld: 0.01,
          position: 100,
          value: 1000,
          pctChange: 0.05,
        },
        {
          organization: "Büyük Fon",
          reportDate: new Date("2024-06-30T00:00:00.000Z"),
          pctHeld: 0.08,
          position: 800,
          value: 8000,
          pctChange: -0.02,
        },
      ],
    },
    1
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization, "Büyük Fon");
  assert.equal(rows[0].pctHeldPct, 8);
  assert.equal(rows[0].changePct, -2);
  assert.equal(rows[0].reportDate, "2024-06-30");
});

test("normalizeOwnership: eksik alanlar null olur", () => {
  const rows = normalizeOwnership({ ownershipList: [{ organization: "X" }] });
  assert.equal(rows[0].pctHeldPct, null);
  assert.equal(rows[0].reportDate, null);
  assert.deepEqual(normalizeOwnership({}), []);
});

test("normalizeOwnershipBreakdown: kesirleri yüzdeye çevirir", () => {
  const b = normalizeOwnershipBreakdown({
    insidersPercentHeld: 0.0165,
    institutionsPercentHeld: 0.6657,
    institutionsFloatPercentHeld: 0.6769,
    institutionsCount: 7739,
  });

  assert.ok(b);
  assert.equal(b.insidersPct! / 100, 0.0165);
  assert.equal(b.institutionsPct! / 100, 0.6657);
  assert.equal(b.institutionsFloatPct! / 100, 0.6769);
  assert.equal(b.institutionsCount, 7739);
  assert.equal(normalizeOwnershipBreakdown(null), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { toPercentMap, weightedBeta, concentration } from "./analyzePortfolio.js";

test("tutar dağılımı yüzdeye çevrilir", () => {
  assert.deepEqual(toPercentMap({ TRY: 75, USD: 25 }), { TRY: 75, USD: 25 });
  assert.deepEqual(toPercentMap({ A: 1, B: 1 }), { A: 50, B: 50 });
});

test("yüzde toplamı ~100 olur, boş dağılım 0 döner", () => {
  const pct = toPercentMap({ A: 1, B: 1, C: 1 });
  const sum = Object.values(pct).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) <= 0.05, `toplam ${sum} ~100 olmalı`);
  assert.deepEqual(toPercentMap({}), {});
  assert.deepEqual(toPercentMap({ A: 0 }), { A: 0 });
});

test("ağırlıklı beta ağırlıklı ortalamadır", () => {
  // eşit ağırlık: (1 + 2) / 2 = 1.5
  assert.equal(
    weightedBeta([
      { value: 50, beta: 1 },
      { value: 50, beta: 2 },
    ]),
    1.5
  );
  // tek pozisyon
  assert.equal(weightedBeta([{ value: 100, beta: 0.5 }]), 0.5);
});

test("betası bilinmeyen pozisyonlar ortalamaya katılmaz, kapsama ayrı bildirilir", () => {
  // yalnızca bilinen iki pozisyon üzerinden normalize edilir: (1 + 1) / 2 = 1
  assert.equal(
    weightedBeta([
      { value: 50, beta: 1 },
      { value: 50, beta: 1 },
      { value: 50, beta: null },
    ]),
    1
  );
});

test("hiçbir beta bilinmiyorsa null döner", () => {
  assert.equal(weightedBeta([{ value: 10, beta: null }]), null);
  assert.equal(weightedBeta([]), null);
});

test("negatif beta doğru işlenir", () => {
  assert.equal(
    weightedBeta([
      { value: 50, beta: -1 },
      { value: 50, beta: 1 },
    ]),
    0
  );
});

test("en büyük sektör ve payı bulunur", () => {
  const c = concentration({ Technology: 60, Energy: 40 }, 100);
  assert.equal(c.topSector, "Technology");
  assert.equal(c.topSectorPct, 60);
  assert.equal(c.sectorCount, 2);
  assert.match(c.warning ?? "", /yoğunlaşma riski/);
});

test("eşik altındaki dağılımda uyarı üretilmez", () => {
  const c = concentration({ A: 39, B: 35, C: 26 }, 100);
  assert.equal(c.warning, null);
  assert.equal(c.topSectorPct, 39);
});

test("tek sektörlü portföy uyarı üretir", () => {
  const c = concentration({ Technology: 100 }, 100);
  assert.match(c.warning ?? "", /tek bir sektör/);
});

test("boş portföyde alanlar null/düşük değildir", () => {
  const c = concentration({}, 0);
  assert.equal(c.topSector, null);
  assert.equal(c.topSectorPct, null);
  assert.equal(c.sectorCount, 0);
  assert.equal(c.warning, null);
});

test("Bilinmiyor sektör tek başına kırılımı bozmaz", () => {
  const c = concentration({ Bilinmiyor: 100 }, 100);
  assert.equal(c.sectorCount, 1);
  assert.equal(c.topSector, "Bilinmiyor");
});

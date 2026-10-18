import test from "node:test";
import assert from "node:assert/strict";
import {
  toPercentMap,
  weightedBeta,
  concentration,
  registerAnalyzePortfolio,
  type PortfolioDeps,
} from "./analyzePortfolio.js";

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

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

function fakeServer() {
  const registered = new Map<string, (args: any) => Promise<any>>();
  const server = {
    tool(name: string, ...rest: unknown[]) {
      registered.set(name, rest[rest.length - 1] as (args: any) => Promise<any>);
      return { name };
    },
  };
  return { server: server as any, registered };
}

test("getiri yalnızca maliyeti bilinen pozisyonlar üzerinden hesaplanır", async () => {
  const { server, registered } = fakeServer();
  const deps: PortfolioDeps = {
    fetchQuotes: (async (symbols: string[]) =>
      symbols.map((s) =>
        s === "AAPL"
          ? {
              symbol: "AAPL",
              regularMarketPrice: 100,
              regularMarketPreviousClose: 95,
              currency: "USD",
            }
          : {
              symbol: "MSFT",
              regularMarketPrice: 200,
              regularMarketPreviousClose: 190,
              currency: "USD",
            }
      )) as any,
    fetchQuote: (async () => undefined) as any,
    fetchQuoteSummary: (async () => ({})) as any,
  };
  registerAnalyzePortfolio(server, deps);

  const out = await registered.get("analyze_portfolio")!({
    positions: [
      { symbol: "AAPL", quantity: 10, cost: 80 },
      { symbol: "MSFT", quantity: 5 },
    ],
    riskFreeRatePct: 30,
    includeBreakdown: false,
  });
  const data = JSON.parse(out.content[0].text);

  // Toplam değer: 10*100 + 5*200 = 2000
  assert.equal(data.portfolioValueUsd, 2000);
  // Maliyet yalnızca AAPL: 10*80 = 800 → kâr yalnızca AAPL üzerinden: 1000 - 800 = 200
  assert.equal(data.totalCostUsd, 800);
  assert.equal(data.unrealizedGainUsd, 200, "maliyetsiz pozisyon kâra eklenmemeli");
  assert.equal(data.unrealizedGainPct, 25);
});

test("maliyet verilmezse getiri alanları null olur", async () => {
  const { server, registered } = fakeServer();
  const deps: PortfolioDeps = {
    fetchQuotes: (async () => [
      { symbol: "AAPL", regularMarketPrice: 100, regularMarketPreviousClose: 99, currency: "USD" },
    ]) as any,
    fetchQuote: (async () => undefined) as any,
    fetchQuoteSummary: (async () => ({})) as any,
  };
  registerAnalyzePortfolio(server, deps);

  const out = await registered.get("analyze_portfolio")!({
    positions: [{ symbol: "AAPL", quantity: 10 }],
    includeBreakdown: false,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.totalCostUsd, null);
  assert.equal(data.unrealizedGainUsd, null);
  assert.equal(data.unrealizedGainPct, null);
});

test("kur alınamazsa TRY pozisyonlu portföy hata döner (1 varsayılmaz)", async () => {
  const { server, registered } = fakeServer();
  const deps: PortfolioDeps = {
    fetchQuotes: (async () => [
      {
        symbol: "THYAO.IS",
        regularMarketPrice: 100,
        regularMarketPreviousClose: 99,
        currency: "TRY",
      },
    ]) as any,
    fetchQuote: (async () => {
      throw new Error("network down");
    }) as any,
    fetchQuoteSummary: (async () => ({})) as any,
  };
  registerAnalyzePortfolio(server, deps);

  const out = await registered.get("analyze_portfolio")!({
    positions: [{ symbol: "THYAO.IS", quantity: 10 }],
    includeBreakdown: false,
  });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /USD\/TRY kuru alınamadı/);
});

test("kur alınamasa bile TRY olmayan portföy hesaplanmaya devam eder", async () => {
  const { server, registered } = fakeServer();
  const deps: PortfolioDeps = {
    fetchQuotes: (async () => [
      { symbol: "AAPL", regularMarketPrice: 100, regularMarketPreviousClose: 99, currency: "USD" },
    ]) as any,
    fetchQuote: (async () => {
      throw new Error("network down");
    }) as any,
    fetchQuoteSummary: (async () => ({})) as any,
  };
  registerAnalyzePortfolio(server, deps);

  const out = await registered.get("analyze_portfolio")!({
    positions: [{ symbol: "AAPL", quantity: 10 }],
    includeBreakdown: false,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(out.isError, undefined);
  assert.equal(data.portfolioValueUsd, 1000);
});

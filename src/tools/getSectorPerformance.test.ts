import test from "node:test";
import assert from "node:assert/strict";
import { periodReturn, bestSector, SECTOR_ETFS } from "./getSectorPerformance.js";

test("dönem getirisi yüzde hesaplanır", () => {
  assert.equal(periodReturn([100, 110]), 10);
  assert.equal(periodReturn([100, 90]), -10);
  assert.equal(periodReturn([50, 100]), 100);
});

test("null ve sıfır kapanışlar atlanır", () => {
  assert.equal(periodReturn([100, null, 0, 120]), 20);
});

test("yetersiz veri null döner", () => {
  assert.equal(periodReturn([]), null);
  assert.equal(periodReturn([100]), null);
  assert.equal(periodReturn([null, null]), null);
  assert.equal(periodReturn([0, 100]), null);
});

test("en güçlü sektör seçilir (null yok sayılır)", () => {
  const rows = [
    { symbol: "XLK", sector: "Teknoloji", periodReturn: 3, bars: 10 },
    { symbol: "XLF", sector: "Finans", periodReturn: 8, bars: 10 },
    { symbol: "XLE", sector: "Enerji", periodReturn: null, bars: 0 },
  ];
  assert.equal(bestSector(rows)?.sector, "Finans");
});

test("veri yoksa null döner", () => {
  assert.equal(
    bestSector([{ symbol: "XLK", sector: "Teknoloji", periodReturn: null, bars: 0 }]),
    null
  );
});

test("11 sektör ETF tanımlı ve semboller benzersiz", () => {
  assert.equal(SECTOR_ETFS.length, 11);
  const symbols = SECTOR_ETFS.map((s) => s.symbol);
  assert.equal(new Set(symbols).size, 11);
  assert.ok(symbols.includes("XLK") && symbols.includes("XLF") && symbols.includes("XLE"));
});

// --- Ağ yolu testleri (sahte bağımlılıklarla) ---

import { registerGetSectorPerformance, type SectorDeps } from "./getSectorPerformance.js";

function fakeServer() {
  const registered = new Map<string, (args: any) => Promise<any>>();
  const server = {
    tool(name: string, ...rest: unknown[]) {
      registered.set(name, rest[rest.length - 1] as (args: any) => Promise<any>);
      return { name };
    },
    registerResource() {
      return {};
    },
  };
  return { server: server as any, registered };
}

/** ETF sembolüne göre sahte mum serisi üretir. */
function sectorDeps(returns: Record<string, number>, failFor: string[] = []): SectorDeps {
  return {
    fetchOhlc: (async (symbol: string) => {
      if (failFor.includes(symbol)) throw new Error("timeout");
      const pct = returns[symbol] ?? 0;
      return { symbol, currency: "USD", rows: [{ close: 100 }, { close: 100 * (1 + pct / 100) }] };
    }) as any,
    fetchQuotes: (async (symbols: string[]) =>
      symbols.map((s) => ({
        symbol: s,
        longName: s,
        regularMarketPrice: 1,
        regularMarketChangePercent: 0,
      }))) as any,
  };
}

test("sektörler getiriye göre sıralanır, en güçlü ve en zayıf belirtilir", async () => {
  const { server, registered } = fakeServer();
  registerGetSectorPerformance(server, sectorDeps({ XLK: 8.5, XLF: -4.7, XLE: 18.2 }));
  const out = await registered.get("get_sector_performance")!({
    period: "1mo",
    includeGlobal: false,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.sectors[0].sector, "Enerji");
  assert.equal(data.sectors[0].periodReturn, 18.2);
  assert.equal(data.strongest.symbol, "XLE");
  assert.equal(data.weakest.symbol, "XLF");
  assert.equal(data.sectors.length, 11);
});

test("erişilemeyen sektörler missing listesine girer, koşu düşmez", async () => {
  const { server, registered } = fakeServer();
  registerGetSectorPerformance(server, sectorDeps({ XLK: 5 }, ["XLF", "XLE"]));
  const out = await registered.get("get_sector_performance")!({
    period: "1mo",
    includeGlobal: false,
  });
  const data = JSON.parse(out.content[0].text);

  assert.ok(data.missing.includes("XLF") && data.missing.includes("XLE"));
  assert.ok(!data.missing.includes("XLK"));
  assert.equal(data.sectors.length, 9);
});

test("tüm sektörler erişilemezse anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  registerGetSectorPerformance(
    server,
    sectorDeps(
      {},
      SECTOR_ETFS.map((s) => s.symbol)
    )
  );
  const out = await registered.get("get_sector_performance")!({
    period: "1mo",
    includeGlobal: false,
  });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /alınamadı/);
});

test("includeGlobal açıkken dünya endeksleri eklenir", async () => {
  const { server, registered } = fakeServer();
  registerGetSectorPerformance(server, sectorDeps({ XLK: 3 }));
  const out = await registered.get("get_sector_performance")!({
    period: "1mo",
    includeGlobal: true,
  });
  const data = JSON.parse(out.content[0].text);

  assert.ok(Array.isArray(data.globalBenchmarks));
  assert.equal(data.globalBenchmarks.length, 5);
  assert.deepEqual(
    data.globalBenchmarks.map((b: any) => b.symbol),
    ["SPY", "QQQ", "DIA", "EEM", "TLT"]
  );
});

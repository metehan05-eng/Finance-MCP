import test from "node:test";
import assert from "node:assert/strict";
import {
  registerGetBistIndices,
  sectorPerformance,
  BIST_INDICES,
  BIST_SECTOR_CODES,
  BIST_BENCHMARK,
  type BistDeps,
} from "./getBistIndices.js";

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

/** Kod için sahte kotasyon üretir; değişim yüzdesi verilmezse fiyatsız döner. */
function deps(changePct: Record<string, number | undefined>, available = true): BistDeps {
  return {
    fetchQuotes: (async (symbols: string[]) =>
      available
        ? symbols
            .map((s) => {
              const code = s.replace(/\.IS$/, "");
              const pct = changePct[code];
              if (pct === undefined) return null;
              return {
                symbol: s,
                longName: BIST_INDICES[code]?.name,
                regularMarketPrice: 1000,
                regularMarketChange: pct / 10,
                regularMarketChangePercent: pct,
                regularMarketVolume: 1000,
              };
            })
            .filter(Boolean)
        : []) as any,
  };
}

test("sectorPerformance benchmark'a göre farkı hesaplar ve sıralar", () => {
  const out = sectorPerformance([
    { index: "XU100", name: "BIST 100", changePercent: 1 },
    { index: "XBANK", name: "BIST BANKA", changePercent: 3 },
    { index: "XUTEK", name: "BIST TEKNOLOJİ", changePercent: -2 },
  ]);
  assert.equal(out.benchmark?.code, "XU100");
  assert.equal(out.leader, "XBANK");
  assert.equal(out.laggard, "XUTEK");
  assert.equal(out.sectors[0].relativeToBenchmarkPct, 2);
  assert.equal(out.sectors[0].outperforming, true);
  assert.equal(out.sectors[1].outperforming, false);
});

test("sectorPerformance benchmark yoksa relative alanı null ve sıralama korunur", () => {
  const out = sectorPerformance([
    { index: "XBANK", name: "BIST BANKA", changePercent: 3 },
    { index: "XUTEK", name: "BIST TEKNOLOJİ", changePercent: -2 },
  ]);
  assert.equal(out.benchmark, null);
  assert.equal(out.sectors.length, 2);
  assert.ok(out.sectors.every((s) => s.relativeToBenchmarkPct === null));
  assert.ok(out.sectors.every((s) => s.outperforming === null));
});

test("benchmark olmayan listede sektör dışı kodlar filtrelenir", () => {
  const out = sectorPerformance([
    { index: "XU030", name: "BIST 30", changePercent: 5 },
    { index: "XBANK", name: "BIST BANKA", changePercent: 1 },
  ]);
  assert.equal(out.sectors.length, 1);
  assert.equal(out.sectors[0].index, "XBANK");
});

test("hiç sektör yoksa leader null", () => {
  const out = sectorPerformance([{ index: "XU100", name: "BIST 100", changePercent: 1 }]);
  assert.equal(out.sectors.length, 0);
  assert.equal(out.leader, null);
  assert.equal(out.laggard, null);
});

test("varsayılan kodlar tanımlı ve doğrulanmış", () => {
  assert.ok(BIST_SECTOR_CODES.length >= 5, `en az 5 sektör olmalı, ${BIST_SECTOR_CODES.length}`);
  assert.ok(BIST_INDICES[BIST_BENCHMARK]);
  for (const code of ["XBANK", "XUTEK", "XGMYO", "XILTM", "XUSIN"]) {
    assert.equal(BIST_INDICES[code]?.kind, "sector", `${code} sektör olmalı`);
  }
  // Yahoo'da karşılığı olmayan kodlar listede bulunmamalı
  for (const dead of ["XU015", "XU010", "XMESM", "XKAGIT"]) {
    assert.equal(BIST_INDICES[dead], undefined, `${dead} olmayan kod olmamalı`);
  }
});

test("varsayılan çağrıda kod listesinden değerler kurulur", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({ XU100: 1, XU030: 0.5, XBANK: 2, XUTEK: -1 }));
  const out = await registered.get("get_bist_indices")!({ includeSectorPerformance: true });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.indices.length, 4);
  assert.equal(data.sectorPerformance.leader, "XBANK");
  assert.equal(data.indices.find((i: any) => i.index === "XBANK").kind, "sector");
  assert.equal(data.indices.find((i: any) => i.index === "XU100").kind, "benchmark");
});

test(".IS soneki ve büyük harf normalize edilir", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({ XBANK: 2 }));
  const out = await registered.get("get_bist_indices")!({
    indices: ["xbank.is", "XBANK"],
    includeSectorPerformance: true,
  });
  const data = JSON.parse(out.content[0].text);

  assert.ok(data.indices.every((i: any) => i.index === "XBANK"));
});

test("includeSectorPerformance false ise sektör kırılımı dönmez", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({ XU100: 1, XBANK: 2 }));
  const out = await registered.get("get_bist_indices")!({
    indices: ["XU100", "XBANK"],
    includeSectorPerformance: false,
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.sectorPerformance, null);
  assert.equal(data.indices.length, 2);
});

test("tanınmayan kod bildirilir", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({ XBANK: 2 }));
  const out = await registered.get("get_bist_indices")!({
    indices: ["XBANK", "XYZ"],
    includeSectorPerformance: true,
  });
  const data = JSON.parse(out.content[0].text);

  assert.deepEqual(data.unknownCodes, ["XYZ"]);
});

test("kod geçerli ama fiyat dönmezse unavailable listesine girer", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({ XBANK: 2 }));
  const out = await registered.get("get_bist_indices")!({
    indices: ["XBANK", "XUTEK"],
    includeSectorPerformance: true,
  });
  const data = JSON.parse(out.content[0].text);

  assert.ok(data.unavailableIndices.includes("BIST TEKNOLOJİ"));
  assert.ok(!data.unavailableIndices.includes("BIST BANKA"));
});

test("hiç veri dönmezse anlaşılır hata döner", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, deps({}, false));
  const out = await registered.get("get_bist_indices")!({ indices: ["XU100"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /alınamadı/);
});

test("ağ hatası yakalanır", async () => {
  const { server, registered } = fakeServer();
  registerGetBistIndices(server, {
    fetchQuotes: (async () => {
      throw new Error("ECONNRESET");
    }) as any,
  });
  const out = await registered.get("get_bist_indices")!({ indices: ["XU100"] });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /ECONNRESET/);
});

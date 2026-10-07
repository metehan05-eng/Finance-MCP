import test from "node:test";
import assert from "node:assert/strict";
import { registerSaveWatchlist, applyMode, type SaveWatchlistDeps } from "./saveWatchlist.js";

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

/** Depolamayı bellekte tutan sahte bağımlılık. */
function memDeps(initial = { symbols: [] as string[], updatedAt: "2026-10-01" }) {
  const state = { ...initial, invalid: false };
  const deps: SaveWatchlistDeps = {
    load: async () => ({ ...state, invalid: state.invalid }),
    save: async (symbols: string[]) => {
      state.symbols = symbols;
      state.updatedAt = new Date().toISOString();
      return { symbols, updatedAt: state.updatedAt };
    },
    path: () => "/tmp/watchlist.json",
  };
  return { deps, state };
}

test("applyMode: replace tamamen değiştirir", () => {
  assert.deepEqual(applyMode(["A", "B"], ["C"], "replace"), ["C"]);
});

test("applyMode: add var olanı tekrar eklemez", () => {
  assert.deepEqual(applyMode(["A"], ["B", "a"], "add"), ["A", "B"]);
  assert.deepEqual(applyMode([], ["X"], "add"), ["X"]);
});

test("applyMode: remove büyük/küçük harf duyarlı siler", () => {
  assert.deepEqual(applyMode(["A", "B", "C"], ["b"], "remove"), ["A", "C"]);
  assert.deepEqual(applyMode(["A"], ["Z"], "remove"), ["A"]);
});

test("applyMode: clear boşaltır", () => {
  assert.deepEqual(applyMode(["A", "B"], ["A"], "clear"), []);
  assert.deepEqual(applyMode([], [], "clear"), []);
});

test("replace modunda liste kaydedilir ve alanlar döner", async () => {
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, memDeps({ symbols: ["OLD"], updatedAt: "2026-10-01" }).deps);
  const out = await registered.get("save_watchlist")!({
    symbols: ["THYAO", "AAPL"],
    mode: "replace",
  });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 2);
  assert.deepEqual(data.symbols, ["THYAO", "AAPL"]);
  assert.deepEqual(data.added, ["THYAO", "AAPL"]);
  assert.deepEqual(data.removed, ["OLD"]);
  assert.equal(data.file, "/tmp/watchlist.json");
  assert.ok(data.readHint.includes("get_watchlist"));
});

test("add modunda mevcut semboller korunur", async () => {
  const { deps, state } = memDeps({ symbols: ["THYAO"], updatedAt: "x" });
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: ["AAPL"], mode: "add" });
  const data = JSON.parse(out.content[0].text);

  assert.deepEqual(data.symbols, ["THYAO", "AAPL"]);
  assert.deepEqual(data.added, ["AAPL"]);
  assert.deepEqual(data.removed, []);
  assert.deepEqual(state.symbols, ["THYAO", "AAPL"]);
});

test("remove modunda sembol listeden çıkar", async () => {
  const { deps, state } = memDeps({ symbols: ["THYAO", "AAPL"], updatedAt: "x" });
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: ["thyao"], mode: "remove" });
  const data = JSON.parse(out.content[0].text);

  assert.deepEqual(data.symbols, ["AAPL"]);
  assert.deepEqual(data.removed, ["THYAO"]);
  assert.deepEqual(state.symbols, ["AAPL"]);
});

test("clear modunda liste boşalır ve boş liste hatası verilmez", async () => {
  const { deps, state } = memDeps({ symbols: ["THYAO"], updatedAt: "x" });
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: [], mode: "clear" });
  const data = JSON.parse(out.content[0].text);

  assert.equal(data.count, 0);
  assert.deepEqual(state.symbols, []);
});

test("boş liste kaydetmeye çalışılırsa hata döner", async () => {
  const { deps, state } = memDeps({ symbols: [], updatedAt: "x" });
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: [], mode: "replace" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /Liste boş olamaz/);
  assert.deepEqual(state.symbols, []);
});

test("var olmayan sembolü remove ederse hata döner", async () => {
  const { deps, state } = memDeps({ symbols: ["THYAO"], updatedAt: "x" });
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: ["ZZZ"], mode: "remove" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /Çıkarılacak semboller listede yok: ZZZ/);
  assert.deepEqual(state.symbols, ["THYAO"]);
});

test("dosya bozuksa onarım önerisiyle hata döner", async () => {
  const { deps, state } = memDeps({ symbols: [], updatedAt: "x" });
  state.invalid = true;
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, deps);
  const out = await registered.get("save_watchlist")!({ symbols: ["AAPL"], mode: "replace" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /dosyası bozuk/);
  assert.match(out.content[0].text, /mode=replace/);
});

test("kayıt başarısız olursa yakalanır", async () => {
  const { server, registered } = fakeServer();
  registerSaveWatchlist(server, {
    load: async () => ({ symbols: ["A"], updatedAt: null, invalid: false }),
    save: async () => {
      throw new Error("EROFS");
    },
    path: () => "/tmp/w.json",
  });
  const out = await registered.get("save_watchlist")!({ symbols: ["A"], mode: "replace" });

  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /EROFS/);
});

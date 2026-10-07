import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  watchlistPath,
  normalizeSymbols,
  parseWatchlist,
  loadWatchlist,
  saveWatchlist,
  emptyWatchlist,
  MAX_WATCHLIST_SYMBOLS,
} from "./watchlistStore.js";

async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finans-wl-"));
  return path.join(dir, "watchlist.json");
}

test("watchlistPath env değişkeniyle geçersiz kılınır", () => {
  assert.equal(
    watchlistPath({ FINANS_WATCHLIST_PATH: " /tmp/x.json " } as NodeJS.ProcessEnv),
    "/tmp/x.json"
  );
  assert.ok(watchlistPath({} as NodeJS.ProcessEnv).endsWith("watchlist.json"));
});

test("normalizeSymbols tekilleştirir, boşlukları atar, sonucu büyük harfe çevirir", () => {
  assert.deepEqual(normalizeSymbols(["  THYAO ", "thyao", "THYAO"]), ["THYAO"]);
  assert.deepEqual(normalizeSymbols(["", "  ", "a"]), ["A"]);
  assert.deepEqual(normalizeSymbols(["aapl", "BTC-USD", " btc-usd "]), ["AAPL", "BTC-USD"]);
});

test("normalizeSymbols limiti aşmaz", () => {
  const many = Array.from({ length: MAX_WATCHLIST_SYMBOLS + 20 }, (_, i) => `S${i}`);
  assert.equal(normalizeSymbols(many).length, MAX_WATCHLIST_SYMBOLS);
});

test("parseWatchlist bozuk girdiyi güvenli biçimde işler", () => {
  assert.deepEqual(parseWatchlist(null), emptyWatchlist());
  assert.deepEqual(parseWatchlist("x"), emptyWatchlist());
  assert.deepEqual(parseWatchlist({ symbols: "AAPL" }), emptyWatchlist());
  assert.deepEqual(parseWatchlist({ symbols: [1, "AAPL", null, "aapl"] }), {
    symbols: ["AAPL"],
    updatedAt: null,
  });
  assert.equal(parseWatchlist({ symbols: [], updatedAt: "geçersiz" }).updatedAt, null);
  const iso = "2026-10-07T00:00:00.000Z";
  assert.equal(parseWatchlist({ symbols: ["A"], updatedAt: iso }).updatedAt, iso);
});

test("dosya yoksa boş liste döner ve invalid değildir", async () => {
  const file = await tmpFile();
  const out = await loadWatchlist(file);
  assert.deepEqual(out, { symbols: [], updatedAt: null, invalid: false });
});

test("bozuk JSON invalid işaretler verir, throw etmez", async () => {
  const file = await tmpFile();
  await fs.writeFile(file, "{ bozuk json", "utf8");
  const out = await loadWatchlist(file);
  assert.equal(out.invalid, true);
  assert.deepEqual(out.symbols, []);
});

test("dizin yoksa oluşturulur ve dosya atomik yazılır", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finans-wl-"));
  const file = path.join(dir, "nested", "deep", "watchlist.json");
  const saved = await saveWatchlist(["THYAO", "thyao", "AAPL"], file);

  assert.deepEqual(saved.symbols, ["THYAO", "AAPL"]);
  assert.ok(saved.updatedAt);
  const loaded = await loadWatchlist(file);
  assert.deepEqual(loaded.symbols, ["THYAO", "AAPL"]);
  assert.equal(loaded.invalid, false);

  const stat = await fs.stat(file);
  assert.equal(stat.mode & 0o777, 0o600, "dosya izinleri 0600 olmalı");

  const leftovers = (await fs.readdir(path.dirname(file))).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftovers, [], "geçici dosya kalmamalı");
});

test("saveWatchlist listeyi normalize eder", async () => {
  const file = await tmpFile();
  const saved = await saveWatchlist([" aapl ", "AAPL", "BTC-USD"], file);
  assert.deepEqual(saved.symbols, ["AAPL", "BTC-USD"]);
});

test("üzerine yazılan liste eski içeriği tamamen değiştirir", async () => {
  const file = await tmpFile();
  await saveWatchlist(["THYAO", "GARAN"], file);
  await saveWatchlist(["AAPL"], file);
  const out = await loadWatchlist(file);
  assert.deepEqual(out.symbols, ["AAPL"]);
});

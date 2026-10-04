#!/usr/bin/env node
// Canlı smoke test: MCP sunucusunu başlatır, araçları gerçek kaynaklardan çağırır.
//
// Ağ gerektirir. CI'da haftalık ve main'e push'ta çalışır.
// GitHub runner IP'leri zaman zaman kaynaklar tarafından engellendiği için:
//   - her vaka 2 kez yeniden denenir (üstel geri çekilme)
//   - "zorunlu" vakalar (çekirdek işlevler) başarısız olursa koşu başarısız
//   - "isteğe bağlı" vakalar başarısız olursa koşu başarılı sayılır, uyarı verir
//
// Kullanım:
//   node scripts/smoke.mjs            # varsayılan: toleranslı
//   node scripts/smoke.mjs --strict   # tüm vakalar zorunlu
//   node scripts/smoke.mjs --only=get_dividend_history,get_analyst_consensus
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(root, "build/index.js");

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? onlyArg
      .split("=")[1]
      .split(",")
      .map((s) => s.trim())
  : null;

/** critical: true → başarısızlık koşuyu düşürür. */
const CASES = [
  { name: "get_exchange_rate", args: { from: "USD", to: "TRY" }, critical: true },
  { name: "get_crypto_price", args: { coinId: "bitcoin" }, critical: true },
  { name: "get_bist_price", args: { symbol: "XU100" }, critical: true },
  { name: "get_tcmb_snapshot", args: {}, critical: true },
  { name: "get_altin_gram_price", args: {}, critical: false },
  {
    name: "get_technical_indicators",
    args: { symbol: "AAPL", period: "1y", limit: 3 },
    critical: false,
  },
  { name: "get_dividend_history", args: { symbol: "GARAN", years: 3 }, critical: false },
  { name: "get_analyst_consensus", args: { symbol: "THYAO" }, critical: false },
  { name: "get_earnings_info", args: { symbol: "AAPL" }, critical: false },
  { name: "get_crypto_market_overview", args: {}, critical: false },
  { name: "get_market_indicators", args: {}, critical: false },
  { name: "get_watchlist", args: { symbols: ["THYAO", "AAPL", "BTC-USD"] }, critical: false },
  { name: "get_sector_performance", args: { period: "1mo" }, critical: false },
  { name: "get_fund_price", args: { fundCode: "GAF" }, critical: false },
  { name: "get_macro_indicators", args: {}, critical: false },
  { name: "get_policy_rate", args: { history: 3 }, critical: false },
  { name: "get_economic_calendar", args: { range: "thisweek" }, critical: false },
  { name: "get_data_health", args: { only: ["yahoo_finance", "coingecko"] }, critical: true },
];

const selected = only ? CASES.filter((c) => only.includes(c.name)) : CASES;
if (selected.length === 0) {
  console.error("--only ile eşleşen vaka yok:", only.join(", "));
  process.exit(2);
}

const proc = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });
const rl = createInterface({ input: proc.stdout });

let id = 0;
const pending = new Map();
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  } catch {
    /* stdout'ta JSON olmayan satırları yoksay */
  }
});

const send = (method, params) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: mid, method, params }) + "\n");
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "2.0.0" },
});
proc.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
);

const toolList = await send("tools/list", {});
console.log(`Kayıtlı araç sayısı: ${toolList.result.tools.length}`);

const results = [];
for (const c of selected) {
  let attempt = 0;
  let lastError = "";
  let ok = false;
  let ms = 0;

  while (attempt < 2 && !ok) {
    attempt++;
    const started = Date.now();
    const res = await send("tools/call", { name: c.name, arguments: c.args });
    ms = Date.now() - started;
    const text = res.result?.content?.[0]?.text ?? JSON.stringify(res.error ?? res.result);
    ok = !res.result?.isError;
    if (!ok) {
      lastError = text.replace(/\s+/g, " ").slice(0, 130);
      if (attempt < 2) {
        console.log(`  ↻ ${c.name} başarısız, tekrar deneniyor…`);
        await sleep(1500 * attempt);
      }
    }
  }

  results.push({ ...c, ok, ms, attempts: attempt, error: lastError });
  const mark = ok ? "OK  " : c.critical || strict ? "HATA" : "UYARI";
  console.log(
    `${mark} ${c.name} (${ms}ms${attempt > 1 ? `, ${attempt}. deneme` : ""}) ${ok ? "" : lastError}`
  );
}

proc.kill();

const failed = results.filter((r) => !r.ok);
const blocking = failed.filter((r) => r.critical || strict);
const warned = failed.filter((r) => !r.critical && !strict);
const retried = results.filter((r) => r.attempts > 1 && r.ok);

console.log(`\n${results.length - failed.length}/${results.length} vaka başarılı`);
if (retried.length > 0) {
  console.log(
    `(↻ ${retried.length} vaka ancak tekrar denemede geçti: ${retried.map((r) => r.name).join(", ")})`
  );
}
if (warned.length > 0) {
  console.log(`\nİsteğe bağlı kaynaklarda sorun (koşu başarılı sayıldı):`);
  for (const w of warned) console.log(`  - ${w.name}: ${w.error}`);
}
console.log(
  blocking.length === 0 ? "\nSONUÇ: başarılı" : "\nSONUÇ: başarısız (kritik vakalar düştü)"
);
process.exit(blocking.length === 0 ? 0 : 1);

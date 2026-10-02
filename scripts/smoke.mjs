#!/usr/bin/env node
// Canlı smoke test: MCP sunucusunu başlatır, birkaç aracı gerçek kaynaklardan çağırır.
// Ağ gerektirir; CI'da her PR'da değil, ayrı workflow'da çalıştırılır.
// Kullanım: node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(root, "build/index.js");

const CASES = [
  ["get_exchange_rate", { from: "USD", to: "TRY" }],
  ["get_bist_price", { symbol: "XU100" }],
  ["get_crypto_price", { coinId: "bitcoin" }],
  ["get_tcmb_snapshot", {}],
  ["get_altin_gram_price", {}],
  ["get_technical_indicators", { symbol: "AAPL", period: "1y", limit: 3 }],
  ["get_dividend_history", { symbol: "GARAN", years: 3 }],
  ["get_analyst_consensus", { symbol: "THYAO" }],
  ["get_crypto_market_overview", {}],
  ["get_fund_price", { fundCode: "GAF" }],
  ["get_macro_indicators", {}],
  ["get_data_health", { only: ["yahoo_finance", "coingecko"] }],
];

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
  } catch {}
});

const send = (method, params) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: mid, method, params }) + "\n");
  });

await send("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "1.0.0" },
});
proc.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
);

const toolList = await send("tools/list", {});
console.log(`Kayıtlı araç sayısı: ${toolList.result.tools.length}`);

let failed = 0;
for (const [name, args] of CASES) {
  const started = Date.now();
  const res = await send("tools/call", { name, arguments: args });
  const ms = Date.now() - started;
  const text = res.result?.content?.[0]?.text ?? "";
  const ok = !res.result?.isError;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "HATA"} ${name} (${ms}ms) ${ok ? "" : text.slice(0, 120)}`);
}

proc.kill();
console.log(`\n${CASES.length - failed}/${CASES.length} smoke testi başarılı`);
process.exit(failed > 0 ? 1 : 0);

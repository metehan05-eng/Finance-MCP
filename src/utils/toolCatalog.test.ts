import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TOOL_CATALOG, registerToolCatalog } from "./toolCatalog.js";

const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
const TOOLS_DIR = path.join(SRC_ROOT, "tools");

/** Kaynak dosyalardaki `server.tool("<ad>"` kayıtlarından gerçek araç adlarını toplar. */
function registeredToolNames(): string[] {
  const names: string[] = [];
  const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  for (const f of files) {
    const text = readFileSync(path.join(TOOLS_DIR, f), "utf8");
    const re = /server\.tool\(\s*"([a-z_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) names.push(m[1]!);
  }
  return names.sort();
}

test("katalog: her kayıtlı araç katalogda tam olarak bir kez yer alır", () => {
  const registered = registeredToolNames();
  const catalogNames = TOOL_CATALOG.map((c) => c.name).sort();

  const missing = registered.filter((n) => !catalogNames.includes(n));
  const stale = catalogNames.filter((n) => !registered.includes(n));

  assert.deepEqual(missing, [], `katalogda eksik araçlar: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `katalogda kayıtlı olmayan araç: ${stale.join(", ")}`);
  assert.equal(new Set(catalogNames).size, catalogNames.length, "katalogda yinelenen araç adı var");
  assert.equal(registered.length, 44, "kayıtlı araç sayısı 44 olmalı");
});

test("katalog: her giriş açıklama ve örnek içerir", () => {
  for (const c of TOOL_CATALOG) {
    assert.ok(c.description && c.description.length > 10, `${c.name} açıklaması eksik`);
    assert.ok(c.examples.length >= 1, `${c.name} örnek içermiyor`);
  }
});

test("prompts: şablonlarda var olmayan araca atıf yok", () => {
  const known = new Set([
    ...registeredToolNames(),
    "market_morning_brief",
    "stock_deep_dive",
    "portfolio_review",
    "data_source_diagnosis",
  ]);
  const text = readFileSync(path.join(SRC_ROOT, "utils/financePrompts.ts"), "utf8");
  const tokens = new Set(text.match(/[a-zA-Z]+_[a-zA-Z_]+/g) ?? []);
  const unknown = [...tokens].filter(
    (t) => /^(get_|save_|compare_|analyze_|search_|backtest_)/.test(t) && !known.has(t)
  );
  assert.deepEqual(unknown, [], `şablonlarda bilinmeyen araç adları: ${unknown.join(", ")}`);
});

test("katalog kaynağı TOOL_CATALOG içeriğini döndürür", async () => {
  const captured: { handler?: (uri: any) => Promise<any> } = {};
  const server = {
    _registeredTools: Object.fromEntries(TOOL_CATALOG.map((c) => [c.name, {}])),
    registerResource(_name: string, _uri: string, _meta: unknown, handler: (uri: any) => any) {
      captured.handler = handler;
      return {};
    },
  };
  registerToolCatalog(server as any);
  assert.ok(captured.handler, "registerResource çağrılmalı");

  const res = await captured.handler!({ href: "finans://tools/catalog" });
  const data = JSON.parse(res.contents[0].text);
  assert.equal(data.toolCount, 44);
  assert.equal(data.tools.length, 44);
});

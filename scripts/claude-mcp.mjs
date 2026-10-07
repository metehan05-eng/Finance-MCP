#!/usr/bin/env node
// Claude Code ve diğer stdio MCP istemcileri için başlatıcı.
// - build/index.js yoksa önce `npm run build` çalıştırır (ilk kurulumda tek adım).
// - Sunucuyu çocuk süreç olarak çalıştırır, sinyalleri iletir, çıkış kodunu devreder.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "build", "index.js");

if (!existsSync(entry)) {
  console.error("[claude-mcp] build/index.js yok; kaynak derleniyor...");
  const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) {
    console.error("[claude-mcp] build başarısız: npm run build çıktısını kontrol edin.");
    process.exit(build.status ?? 1);
  }
}

const server = spawn(process.execPath, [entry], { cwd: root, stdio: "inherit" });

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => server.kill(sig));
}

server.on("error", (err) => {
  console.error(`[claude-mcp] sunucu başlatılamadı: ${err.message}`);
  process.exit(1);
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

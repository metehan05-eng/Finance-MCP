import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Maksimum saklanan sembol sayısı. */
export const MAX_WATCHLIST_SYMBOLS = 50;

export interface WatchlistFile {
  symbols: string[];
  updatedAt: string | null;
}

/** Boş liste nesnesi. */
export function emptyWatchlist(): WatchlistFile {
  return { symbols: [], updatedAt: null };
}

/**
 * İzleme listesi dosyasının yolu.
 * `FINANS_WATCHLIST_PATH` ile geçersiz kılınabilir (test/container için).
 */
export function watchlistPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.FINANS_WATCHLIST_PATH;
  if (override && override.trim()) return override.trim();
  return path.join(os.homedir(), ".finans-mcp", "watchlist.json");
}

/** Sembolleri büyük/küçük harf duyarlı biçimde tekilleştirir, ilk yazımı korur. */
export function normalizeSymbols(symbols: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of symbols) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const key = t.toUpperCase();
    if (!seen.has(key)) seen.set(key, t.toUpperCase());
  }
  return [...seen.values()].slice(0, MAX_WATCHLIST_SYMBOLS);
}

/** Dışarıdan gelen ham JSON'u güvenli biçimde doğrular. */
export function parseWatchlist(raw: unknown): WatchlistFile {
  if (!raw || typeof raw !== "object") return emptyWatchlist();
  const obj = raw as Record<string, unknown>;
  const symbols = Array.isArray(obj.symbols)
    ? normalizeSymbols(obj.symbols.filter((s): s is string => typeof s === "string"))
    : [];
  const updatedAt =
    typeof obj.updatedAt === "string" && Number.isFinite(Date.parse(obj.updatedAt))
      ? obj.updatedAt
      : null;
  return { symbols, updatedAt };
}

/**
 * Listeyi okur. Dosya yoksa boş liste, bozuksa `invalid: true` işaretli boş liste döner —
 * asla throw etmez (araç yolu kesilmemeli).
 */
export async function loadWatchlist(
  file = watchlistPath()
): Promise<WatchlistFile & { invalid: boolean }> {
  try {
    const text = await fs.readFile(file, "utf8");
    const parsed = parseWatchlist(JSON.parse(text));
    return { ...parsed, invalid: false };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { ...emptyWatchlist(), invalid: false };
    return { ...emptyWatchlist(), invalid: true };
  }
}

/**
 * Listeyi atomik olarak yazar (geçici dosya + rename).
 * Dizin yoksa oluşturulur; dosya izinleri 0600.
 */
export async function saveWatchlist(
  symbols: string[],
  file = watchlistPath()
): Promise<WatchlistFile> {
  const normalized = normalizeSymbols(symbols);
  const payload: WatchlistFile = { symbols: normalized, updatedAt: new Date().toISOString() };
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
  return payload;
}

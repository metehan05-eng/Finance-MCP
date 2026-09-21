import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Exponential backoff ile HTTP isteği atar.
 * - 3 deneme hakkı
 * - Her denemede 10 saniyelik timeout
 * - 429 (rate limit) yanıtında otomatik bekleme
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 429 Rate limit → bekle ve tekrar dene
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : attempt * 1500;
        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        await sleep(attempt * 1000); // 1s, 2s, 3s
      }
    }
  }

  throw lastError ?? new Error("Bilinmeyen ağ hatası");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tutarlı hata yanıtı döndürmek için yardımcı.
 */
export function errorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

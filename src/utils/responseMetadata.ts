import { AsyncLocalStorage } from "node:async_hooks";
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface DataSourceUse {
  source: string;
  cacheStatus: "miss" | "hit" | "shared" | "stale" | "network";
  fetchedAt: string;
  ageSeconds: number;
}

interface RequestMetadata {
  sources: Map<string, DataSourceUse>;
}

const requestStorage = new AsyncLocalStorage<RequestMetadata>();

/** Legacy `server.tool` is used by the existing tool modules. Wrap its handler
 * at registration so all JSON tool results get the same provenance envelope. */
export function installResponseMetadata(server: McpServer): void {
  const mutable = server as unknown as { tool: (...args: any[]) => unknown };
  const originalTool = mutable.tool.bind(server);
  mutable.tool = (...args: any[]) => {
    const callbackIndex = args.length - 1;
    const callback = args[callbackIndex];
    if (typeof callback === "function") {
      args[callbackIndex] = withResponseMetadata(callback as ToolCallback<any>);
    }
    return originalTool(...args);
  };
}

export function recordDataSource(use: DataSourceUse): void {
  const request = requestStorage.getStore();
  if (!request) return;
  const existing = request.sources.get(use.source);
  // If the request combines multiple calls to one source, surface the stalest
  // result so the metadata never overstates freshness.
  if (!existing || use.ageSeconds >= existing.ageSeconds || use.cacheStatus === "stale") {
    request.sources.set(use.source, use);
  }
}

export function withResponseMetadata(callback: ToolCallback<any>): ToolCallback<any> {
  return async (...args: any[]) => {
    const metadata: RequestMetadata = { sources: new Map() };
    const invoke = callback as (...callbackArgs: any[]) => CallToolResult | Promise<CallToolResult>;
    const result = await requestStorage.run(metadata, () => invoke(...args));
    if (!result || result.isError || !Array.isArray(result.content)) return result;

    const sourceData = [...metadata.sources.values()];
    const value = {
      generatedAt: new Date().toISOString(),
      sources: sourceData,
      staleData: sourceData.some((item) => item.cacheStatus === "stale"),
      note: "fetchedAt kaynağın son başarılı veri zamanıdır; stale, kaynak hatasında 24 saat içinde saklanan eski verinin kullanıldığını belirtir.",
    };

    for (const item of result.content) {
      if (item.type !== "text") continue;
      try {
        const parsed: unknown = JSON.parse(item.text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          item.text = JSON.stringify(
            { ...(parsed as Record<string, unknown>), _dataMetadata: value },
            null,
            2
          );
          return result;
        }
      } catch {
        // Human-readable results receive metadata as an additional text block.
      }
    }
    result.content.push({ type: "text", text: `Data metadata: ${JSON.stringify(value)}` });
    return result;
  };
}

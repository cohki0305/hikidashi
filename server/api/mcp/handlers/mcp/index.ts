import { createFactory } from "hono/factory";
import type { McpEnv } from "@/server/api/mcp/context";
import { ok } from "@/server/lib/http";
import { acceptedWithoutBody, methodNotAllowed } from "@/server/lib/mcp/http";
import { handleJsonRpc } from "@/server/lib/mcp/json-rpc";

const factory = createFactory<McpEnv>();

/** ここに開く口は、JSON-RPC を 1 通ずつ POST する形だけ。 */
export const index = factory.createHandlers((c) => methodNotAllowed(c, "POST"));

/** AI からの JSON-RPC を 1 通受ける。通知には本文なしの 202 を返す。 */
export const create = factory.createHandlers(async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const reply = await handleJsonRpc(body, c.get("handlers"));
  if (!reply) return acceptedWithoutBody(c);
  return ok(c, reply);
});

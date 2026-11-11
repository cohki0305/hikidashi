import { createFactory, createMiddleware } from "hono/factory";
import { unauthorized } from "@/server/lib/mcp/http";
import type { McpEnv, McpServicePort } from "./context";
import { mcpRoutes } from "./routes";

const factory = createFactory<McpEnv>();

export type McpDependencies = { mcp?: Partial<McpServicePort>; appUrl?: string };

const BEARER = /^Bearer (hkd_at_[A-Za-z0-9_-]+)$/;

function completePort(mcp?: Partial<McpServicePort>): McpServicePort | null {
  if (!mcp?.authenticate || !mcp.handlersFor) return null;
  return mcp as McpServicePort;
}

/**
 * AI が読む入口。Bearer のトークンを呼び出しごとに確かめ、無い・無効なら 401 と
 * 認可サーバーの場所（RFC 9728）を返す。依存が欠けた構成では何も載せない（fail closed）。
 */
export function createMcpRoutes({ mcp, appUrl }: McpDependencies) {
  const port = completePort(mcp);
  if (!port || !appUrl) return factory.createApp();
  const origin = appUrl.replace(/\/+$/, "");
  const authenticate = createMiddleware<McpEnv>(async (c, next) => {
    // GET は本人確認より先に 405 にする（ここに開く口が無いことを伝える）
    if (c.req.method !== "POST") return next();
    const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    const call = token ? await port.authenticate(token) : null;
    if (!call) {
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
      );
      return unauthorized(c);
    }
    c.set("mcp", port);
    c.set("appUrl", origin);
    c.set("call", call);
    c.set("handlers", port.handlersFor(call));
    await next();
  });
  return factory.createApp().use("/mcp", authenticate).route("/", mcpRoutes);
}

export type { McpEnv, McpServicePort } from "./context";

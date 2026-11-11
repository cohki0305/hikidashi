import { createFactory } from "hono/factory";
import type { OAuthEnv } from "@/server/api/oauth/context";
import { ok } from "@/server/lib/http";

const factory = createFactory<OAuthEnv>();

/** この API（/mcp）を守る認可サーバーの場所（RFC 9728）。 */
export const index = factory.createHandlers((c) =>
  ok(c, {
    resource: `${c.get("appUrl")}/mcp`,
    authorization_servers: [c.get("appUrl")],
    bearer_methods_supported: ["header"]
  })
);

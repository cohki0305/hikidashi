import { describe, expect, test } from "bun:test";
import * as mcp from "@/server/api/mcp/handlers/mcp";
import { mcpRoutes } from "@/server/api/mcp/routes";

describe("mcpRoutes", () => {
  test("ルート表が各ハンドラを指す", () => {
    const routes = mcpRoutes.routes.map(({ method, path, handler }) => ({
      method,
      path,
      handler
    }));
    expect(routes).toEqual([
      { method: "GET", path: "/mcp", handler: mcp.index[0] },
      { method: "POST", path: "/mcp", handler: mcp.create[0] }
    ]);
  });
});

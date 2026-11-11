import { describe, expect, test } from "bun:test";
import * as me from "@/server/api/protected/me/handlers/me";
import { meRoutes } from "@/server/api/protected/me/routes";

describe("meRoutes", () => {
  test("GET /me が me.index を指す", () => {
    const routes = meRoutes.routes.map(({ method, path, handler }) => ({
      method,
      path,
      handler
    }));

    expect(routes).toEqual([{ method: "GET", path: "/me", handler: me.index[0] }]);
  });
});

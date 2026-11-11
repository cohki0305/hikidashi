import { describe, expect, test } from "bun:test";
import * as approvals from "@/server/api/protected/oauth-requests/handlers/approvals";
import * as denials from "@/server/api/protected/oauth-requests/handlers/denials";
import * as show from "@/server/api/protected/oauth-requests/handlers/show";
import { oauthRequestsRoutes } from "@/server/api/protected/oauth-requests/routes";

describe("oauthRequestsRoutes", () => {
  test("ルート表が各ハンドラを指す", () => {
    const actual = new Map(
      oauthRequestsRoutes.routes.map(({ method, path, handler }) => [`${method} ${path}`, handler])
    );
    expect(Object.fromEntries(actual)).toEqual({
      "GET /:id": show.show[1],
      "POST /:id/approvals": approvals.create[1],
      "POST /:id/denials": denials.create[1]
    });
  });
});

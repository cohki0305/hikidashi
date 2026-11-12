import { describe, expect, test } from "bun:test";
import * as invites from "@/server/api/protected/invites/handlers/invites";
import * as redemptions from "@/server/api/protected/invites/handlers/redemptions";
import { inviteRoutes } from "./routes";

describe("inviteRoutes", () => {
  test("ルート表が各ハンドラを指す", () => {
    const actual = new Map(
      inviteRoutes.routes.map(({ method, path, handler }) => [`${method} ${path}`, handler])
    );

    expect(Object.fromEntries(actual)).toEqual({
      "GET /": invites.index[0],
      "POST /": invites.create[0],
      "DELETE /:id": invites.destroy[1],
      "POST /redemptions": redemptions.create[1]
    });
  });
});

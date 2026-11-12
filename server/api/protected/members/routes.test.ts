import { describe, expect, test } from "bun:test";
import * as members from "@/server/api/protected/members/handlers/members";
import { memberRoutes } from "./routes";

describe("memberRoutes", () => {
  test("ルート表が各ハンドラを指す", () => {
    const actual = new Map(
      memberRoutes.routes.map(({ method, path, handler }) => [`${method} ${path}`, handler])
    );

    expect(Object.fromEntries(actual)).toEqual({
      "GET /members": members.index[0],
      "DELETE /members/:email": members.destroy[1]
    });
  });
});

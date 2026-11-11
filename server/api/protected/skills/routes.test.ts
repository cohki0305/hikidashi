import { describe, expect, test } from "bun:test";
import * as skillVersionDownloads from "@/server/api/protected/skills/handlers/skill-version-downloads";
import * as skillVersionFiles from "@/server/api/protected/skills/handlers/skill-version-files";
import * as skills from "@/server/api/protected/skills/handlers/skills";
import { skillRoutes } from "@/server/api/protected/skills/routes";

describe("skillRoutes", () => {
  test("API 表の 4 本がハンドラを指す", () => {
    const routes = skillRoutes.routes.map(({ method, path, handler }) => ({
      method,
      path,
      handler
    }));

    expect(routes).toEqual([
      { method: "GET", path: "/skills", handler: skills.index[0] },
      { method: "GET", path: "/skills/:skillName", handler: skills.show[0] },
      {
        method: "GET",
        path: "/skills/:skillName/versions/:version/files",
        handler: skillVersionFiles.index[0]
      },
      {
        method: "GET",
        path: "/skills/:skillName/versions/:version/download",
        handler: skillVersionDownloads.index[0]
      }
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import {
  FILE_RULE,
  findRouteRestViolations,
  findVerbInRoutePathViolations,
  VERB_SEGMENTS
} from "./lint-route-rest";

const verb = (path: string, line: number, segment: string) => ({
  path,
  line,
  message: `ルートパスに動詞 "${segment}" がある`,
  rule: "verb-in-route-path" as const
});

describe("lint:route-rest", () => {
  test("パスの動詞セグメントを検出する", () => {
    const violations = findRouteRestViolations(
      "server/api/protected/skills/routes.ts",
      `app.post("/skills/:id/join", ...skills.join)`
    );
    expect(violations).toEqual([verb("server/api/protected/skills/routes.ts", 1, "join")]);
  });

  test.each(["confirm", "cancel", "start", "stop", "leave", "move", "send", "approve", "reject"])(
    "動詞 %s を検出する",
    (segment) => {
      const violations = findRouteRestViolations(
        "server/api/skills.ts",
        `app.put("/skills/:id/${segment}", h)`
      );
      expect(violations.map((v) => v.rule)).toEqual(["verb-in-route-path"]);
    }
  );

  test("パスが次の行にあっても検出する", () => {
    const source = `app\n  .post(\n    "/skills/:id/start",\n    h\n  );`;
    expect(findRouteRestViolations("server/api/skills.ts", source)).toEqual([
      verb("server/api/skills.ts", 1, "start")
    ]);
  });

  test("テンプレートリテラルや単引用符のパスも検出する", () => {
    const source = `app.post('/skills/:id/run', h);\napp.delete(\`/skills/:id/delete\`, h);`;
    expect(findRouteRestViolations("server/api/skills.ts", source).map((v) => v.line)).toEqual([
      1, 2
    ]);
  });

  test("動詞のパスの違反を検出する", () => {
    expect(
      findRouteRestViolations(
        "server/api/protected/skills/routes.ts",
        `app.post("/skills/send", ...skills.send)`
      )
    ).toHaveLength(1);
  });

  test("動詞辞書と名詞一覧が重なったら名詞を優先する", () => {
    const verbs = new Set([...VERB_SEGMENTS, "settings", "status", "versions", "files", "uploads"]);
    const nouns = [
      `app.put("/skills/:name/settings", h);`,
      `app.get("/skills/:name/status", h);`,
      `app.get("/skills/:name/versions", h);`,
      `app.get("/skills/:name/files", h);`,
      `app.post("/skills/:name/uploads", h);`
    ].join("\n");
    expect(
      findVerbInRoutePathViolations("server/api/skills.ts", nouns, undefined, { verbs })
    ).toEqual([]);
    expect(
      findVerbInRoutePathViolations(
        "server/api/skills.ts",
        `app.post("/skills/send", h);`,
        undefined,
        { verbs }
      )
    ).toHaveLength(1);
  });

  test("名詞形（versions / settings / status / downloads）は通る", () => {
    const source = [
      `app.get("/skills/:name/versions", h);`,
      `app.get("/skills/:name/settings", h);`,
      `app.put("/skills/:name/status", h);`,
      `app.get("/skills/:name/downloads", h);`
    ].join("\n");
    expect(findRouteRestViolations("server/api/skills.ts", source)).toEqual([]);
  });

  test("パスパラメータは動詞に見えても無視する", () => {
    expect(findRouteRestViolations("server/api/skills.ts", `app.get("/skills/:join", h)`)).toEqual(
      []
    );
  });

  test("handler 内の try を検出する", () => {
    const source = `export const create = factory.createHandlers(async (c) => {
  try {
    return ok(c, {});
  } catch (e) {
    return failure(c, e);
  }
});`;
    expect(findRouteRestViolations("server/api/skills/handlers/index.ts", source)).toEqual([
      {
        path: "server/api/skills/handlers/index.ts",
        line: 2,
        message: "route handler で try/catch しない",
        rule: "try-catch-in-handler"
      }
    ]);
  });

  test("try / finally や同じ行の try も検出し、try という識別子・コメント・文字列は無視する", () => {
    const source = `const a = async () => { try { await x(); } finally { y(); } };
const retry = 1;
// try { ... } は書かない
const note = "try { x }";
const entry = { try: 1 };`;
    const violations = findRouteRestViolations("server/api/skills/handlers/index.ts", source);
    expect(violations.map((v) => v.line)).toEqual([1]);
  });

  test("handlers/ 以外（index.ts・routes.ts・その他）の try も検出する", () => {
    const source = `try {\n} catch {}`;
    for (const file of [
      "server/api/skills/routes.ts",
      "server/api/skills/index.ts",
      "server/api/health/index.ts",
      "server/api/protected/me/index.ts"
    ])
      expect(findRouteRestViolations(file, source).map((v) => v.rule)).toEqual([
        "try-catch-in-handler"
      ]);
  });

  test("resend を動詞として検出する", () => {
    expect(
      findRouteRestViolations(
        "server/api/protected/skills/routes.ts",
        `app.post("/skills/:name/resend", h)`
      ).map((v) => v.rule)
    ).toEqual(["verb-in-route-path"]);
    expect(VERB_SEGMENTS.has("resend")).toBe(true);
  });

  test(".on() のパスも動詞を検出する", () => {
    expect(
      findRouteRestViolations("server/api/skills.ts", `app.on("POST", "/skills/:id/join", h)`).map(
        (v) => v.rule
      )
    ).toEqual(["verb-in-route-path"]);
  });

  test("同一ファイルの const 文字列のパスも解決して動詞を検出する", () => {
    const source = `const P = "/skills/:id/cancel";\napp.post(P, h);`;
    expect(findRouteRestViolations("server/api/skills.ts", source)).toEqual([
      verb("server/api/skills.ts", 2, "cancel")
    ]);
  });

  test("kebab-case に含まれる動詞を検出する", () => {
    const source = `app.post("/skills/:id/start-game", h);\napp.post("/cancel-order", h);\napp.get("/skills/:id/last-seen", h);`;
    expect(findRouteRestViolations("server/api/skills.ts", source)).toEqual([
      verb("server/api/skills.ts", 1, "start"),
      verb("server/api/skills.ts", 2, "cancel")
    ]);
  });

  test("server/api 以外・テストファイル・allowlist は対象外", () => {
    const bad = `app.post("/skills/:id/join", h);\ntry {\n} catch {}`;
    expect(findRouteRestViolations("server/services/a.ts", bad)).toEqual([]);
    expect(findRouteRestViolations("server/api/foo.test.ts", bad)).toEqual([]);
    expect(
      findRouteRestViolations("server/api/legacy.ts", bad, {
        allowlist: new Set(["server/api/legacy.ts"])
      })
    ).toEqual([]);
  });

  test("FILE_RULE は server/api のテスト以外の ts を対象にする", () => {
    const include = FILE_RULE.include as RegExp;
    expect(include.test("server/api/skills/routes.ts")).toBe(true);
    expect(include.test("server/services/a.ts")).toBe(false);
    expect(FILE_RULE.exclude?.test("server/api/a.test.ts")).toBe(true);
  });
});

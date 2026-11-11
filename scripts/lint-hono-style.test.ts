import { describe, expect, test } from "bun:test";
import { runFileRules } from "./lib/lint-runner-engine";
import { FILE_RULE, findHonoStyleViolations } from "./lint-hono-style";

const ROUTES = "server/api/protected/skills/routes.ts";
const HANDLER = "server/api/protected/skills/handlers/skills/index.ts";
const rules = (file: string, source: string) =>
  findHonoStyleViolations(file, source).map((v) => v.rule);

describe("typed-hono-constructor", () => {
  test("flags new Hono<Env>() including a namespace-free alias chain", () => {
    expect(
      findHonoStyleViolations(
        "server/api/protected/me.ts",
        `export const meRoutes = new Hono<Env>().get("/", (c) => ok(c, {}));`
      )
    ).toEqual([
      {
        path: "server/api/protected/me.ts",
        line: 1,
        message: "Env 型付きの new Hono<Env>() は使わない。createFactory<Env>() で共有する",
        rule: "typed-hono-constructor"
      }
    ]);
  });

  test("allows new Hono() without type arguments and createFactory", () => {
    expect(
      findHonoStyleViolations(
        "server/api/health/routes.ts",
        `export const healthRoutes = new Hono().get("/", (c) => ok(c, { status: "ok" }));`
      )
    ).toEqual([]);
    expect(
      rules("server/api/protected/me.ts", `export const app = factory.createApp().get("/", h);`)
    ).not.toContain("typed-hono-constructor");
  });
});

describe("routes-in-index", () => {
  test("flags route definitions in a composition index.ts", () => {
    const source = `export function createSkillsRoutes() {
  return factory.createApp().get("/skills", async (c) => ok(c, []));
}`;
    expect(rules("server/api/protected/skills/index.ts", source)).toContain("routes-in-index");
  });

  test("allows composition-only index.ts and single-file resources", () => {
    const source = `export function createSkillsRoutes() {
  return factory.createApp().use(mw).onError((e, c) => failure(c, e)).route("/skills", skillsRoutes);
}`;
    expect(rules("server/api/protected/skills/index.ts", source)).toEqual([]);
  });

  test("flags routes in any index.ts under server/api, including single-file resources", () => {
    expect(
      rules("server/api/health/index.ts", `export const r = new Hono().get("/", (c) => ok(c, 1));`)
    ).toContain("routes-in-index");
    expect(
      rules(
        "server/api/protected/me/index.ts",
        `export const r = factory.createApp().post("/", h);`
      )
    ).toContain("routes-in-index");
  });

  test("does not mistake Map#get in handlers index.ts for a route", () => {
    const source = `export const index = factory.createHandlers(async (c) => ok(c, cache.get(key)));`;
    expect(rules(HANDLER, source)).toEqual([]);
  });
});

describe("routes-outside-table", () => {
  test("flags route definitions outside routes.ts inside a resource directory", () => {
    const source = `export const r = factory.createApp().get("/", ...skills.index);`;
    expect(rules("server/api/protected/skills/versions.ts", source)).toEqual([
      "routes-outside-table"
    ]);
  });

  test("allows inline handlers for a single-file resource", () => {
    const source = `export const meRoutes = factory.createApp().get("/", async (c) => ok(c, c.var.user));`;
    expect(rules("server/api/protected/me.ts", source)).toEqual([]);
  });
});

describe("inline-handler / extracted-handler", () => {
  test("flags inline handlers, inline createHandlers and non-spread access in routes.ts", () => {
    expect(
      rules(ROUTES, `export const r = factory.createApp().get("/skills", async (c) => ok(c, []));`)
    ).toEqual(["inline-handler"]);
    expect(
      rules(
        ROUTES,
        `export const r = factory.createApp().get("/skills", ...factory.createHandlers(async (c) => ok(c, [])));`
      )
    ).toEqual(["inline-handler"]);
    expect(
      rules(
        ROUTES,
        `import * as skills from "./handlers/skills";
export const r = factory.createApp().get("/skills", skills.index);`
      )
    ).toEqual(["inline-handler"]);
  });

  test("flags a spread whose namespace is not a handlers namespace import", () => {
    const source = `import { index as skillsIndex } from "./handlers/skills";
export const r = factory.createApp().get("/skills", ...skillsIndex);`;
    expect(rules(ROUTES, source)).toEqual(["inline-handler"]);
  });

  test("flags a named handler passed to a route method", () => {
    const source = `const listItems = async (c) => ok(c, []);
export const routes = app.get("/", listItems);`;
    expect(findHonoStyleViolations("server/api/protected/items.ts", source)).toEqual([
      {
        path: "server/api/protected/items.ts",
        line: 2,
        message: "ルートハンドラを名前付き関数として分離しない（パスパラメータの型推論が壊れる）",
        rule: "extracted-handler"
      }
    ]);
  });

  test("allows a table that only spreads handlers", () => {
    const source = `import * as skills from "./handlers/skills";
import * as skillVersions from "./handlers/skill-versions";
export const skillsRoutes = factory.createApp()
  .get("/skills", ...skills.index)
  .post("/skills/:name/versions", ...skillVersions.create);`;
    expect(rules(ROUTES, source)).toEqual([]);
  });
});

describe("raw-param", () => {
  test("flags c.req.param() under any context name", () => {
    expect(
      rules(
        HANDLER,
        `export const show = factory.createHandlers(async (c) => ok(c, c.req.param("id")));`
      )
    ).toEqual(["raw-param"]);
    expect(
      rules(
        HANDLER,
        `export const show = factory.createHandlers(async (ctx) => ok(ctx, ctx.req.param()));`
      )
    ).toEqual(["raw-param"]);
  });

  test("allows c.req.valid('param')", () => {
    const source = `export const show = factory.createHandlers(async (c) => ok(c, c.req.valid("param")));`;
    expect(rules(HANDLER, source)).toEqual([]);
  });
});

describe("raw-param (pathParam)", () => {
  test("flags pathParam(c, name) like c.req.param()", () => {
    expect(
      rules(
        HANDLER,
        `export const show = factory.createHandlers(async (c) => ok(c, pathParam(c, "id")));`
      )
    ).toEqual(["raw-param"]);
  });

  test("allows a method that merely contains the name", () => {
    expect(
      rules(
        HANDLER,
        `export const show = factory.createHandlers(async (c) => ok(c, x.pathParamLike(c)));`
      )
    ).toEqual([]);
  });
});

describe("on-method", () => {
  test("flags .on() route definitions in routes.ts and index.ts", () => {
    expect(rules(ROUTES, `export const r = factory.createApp().on("GET", "/skills", h);`)).toEqual([
      "on-method"
    ]);
    expect(
      rules(
        "server/api/protected/me/index.ts",
        `export const r = factory.createApp().on(["GET", "POST"], "/", async (c) => ok(c, 1));`
      )
    ).toEqual(["on-method"]);
    expect(
      rules(
        "server/api/health/index.ts",
        `export const r = new Hono().on("GET", "/", (c) => ok(c, 1));`
      )
    ).toContain("on-method");
  });

  test("flags .on() with a constant path, a variable method, or a handler last", () => {
    expect(rules(ROUTES, `export const r = factory.createApp().on("GET", PATH, h);`)).toEqual([
      "on-method"
    ]);
    expect(rules(ROUTES, `export const r = factory.createApp().on(method, "/x", h);`)).toEqual([
      "on-method"
    ]);
    expect(
      rules(ROUTES, `export const r = factory.createApp().on(method, PATH, async (c) => ok(c, 1));`)
    ).toEqual(["on-method"]);
    expect(rules("server/app.ts", `app.on("GET", PATH, h);`)).toEqual(["on-method"]);
  });

  test("does not mistake drizzle's .on(a, b, c) for a route", () => {
    expect(
      rules("server/db/schema/x.ts", `index("i").on(t.skillId, t.versionId, t.status);`)
    ).toEqual([]);
  });

  test("does not mistake an event emitter's .on(event, fn) for a route", () => {
    expect(
      rules(
        HANDLER,
        `export const index = factory.createHandlers(async (c) => { bus.on("done", () => 1); return ok(c, 1); });`
      )
    ).toEqual([]);
  });
});

describe("routes-outside-api", () => {
  test("flags route definitions in server/app.ts and other server files", () => {
    expect(rules("server/app.ts", `app.get("/skills/:name", async (c) => ok(c, 1));`)).toEqual([
      "routes-outside-api"
    ]);
    expect(rules("server/app.ts", `app.put("/skills/:name/versions/:version", h);`)).toEqual([
      "routes-outside-api"
    ]);
    expect(rules("server/middleware/x.ts", `r.post("/x", h);`)).toEqual(["routes-outside-api"]);
    expect(rules("server/app.ts", `app.on("GET", "/x", h);`)).toEqual(["on-method"]);
  });

  test("flags .all / .options and constant-path spread handlers outside server/api", () => {
    expect(rules("server/app.ts", `app.all("/x", async (c) => ok(c, 1));`)).toEqual([
      "routes-outside-api"
    ]);
    expect(rules("server/app.ts", `app.options("/x", h);`)).toEqual(["routes-outside-api"]);
    expect(rules("server/app.ts", `app.get(SKILLS_PATH, ...skillHandlers);`)).toEqual([
      "routes-outside-api"
    ]);
  });

  test("許可リストに手本固有の道を残さず、server/app.ts のルートも検出する", () => {
    expect(rules("server/app.ts", `app.all("/mcp", async (c) => ok(c, 1));`)).toEqual([
      "routes-outside-api"
    ]);
    expect(rules("server/app.ts", `app.all("/", closed);`)).toEqual(["routes-outside-api"]);
    expect(rules("server/other.ts", `app.all("/mcp", async (c) => ok(c, 1));`)).toEqual([
      "routes-outside-api"
    ]);
  });

  test("allows .route() mounts, .use(), and Map#get / context get", () => {
    const source = `const routes = app.use(mw).route("/", meRoutes).route("/api/health", healthRoutes);
const v = cache.get(key); const u = c.get("user"); const w = c.get("x");`;
    expect(rules("server/app.ts", source)).toEqual([]);
  });

  test("does not mistake a plain service method call such as delete(a, b) for a route", () => {
    expect(
      rules("server/services/skill-service/index.ts", `const r = this.skills.delete(name, id);`)
    ).toEqual([]);
  });

  test("does not apply api-only rules outside server/api", () => {
    expect(
      rules("server/app.ts", `const a = new Hono<Env>(); const p = c.req.param("id");`)
    ).toEqual([]);
  });
});

describe("resend は動詞として扱う", () => {
  test("resends を辞書から消したので dir 名を導出できない", () => {
    const head = `import * as skillResends from "./handlers/skill-resends";\n`;
    expect(
      rules(
        "server/api/protected/skills/routes.ts",
        `${head}export const r = factory.createApp().post("/skills/:name/resend", ...skillResends.create);`
      )
    ).toContain("unknown-inflection");
  });
});

describe("raw-response", () => {
  test("flags c.json / c.body / c.text / c.html / c.redirect / new Response in handlers", () => {
    for (const body of [
      `c.json([])`,
      `c.body(null)`,
      `c.text("ok")`,
      `c.html("<p>ok</p>")`,
      `c.redirect("/")`,
      `new Response("ok")`
    ])
      expect(
        rules(HANDLER, `export const index = factory.createHandlers(async (c) => ${body});`)
      ).toEqual(["raw-response"]);
  });

  test("tracks renamed, default and rest context parameters", () => {
    for (const [parameter, name] of [
      ["ctx", "ctx"],
      ["c = fallback", "c"],
      ["...c", "c"]
    ])
      expect(
        rules(
          HANDLER,
          `export const index = factory.createHandlers((${parameter}) => ${name}.json({}));`
        )
      ).toContain("raw-response");
  });

  test("allows response.json() of a fetched Response and the http vocabulary", () => {
    const source = `export const index = factory.createHandlers(async (c) => {
  const response = await fetch(url);
  const data = await response.json();
  return ok(c, data);
});`;
    expect(rules(HANDLER, source)).toEqual([]);
  });

  test("allows c.json() in onError of a composition index.ts", () => {
    const source = `export const r = factory.createApp().onError((e, c) => c.json({ error: e.message }, 500));`;
    expect(rules("server/api/protected/skills/index.ts", source)).toEqual([]);
  });
});

describe("unknown-action", () => {
  test("flags exports outside the five actions", () => {
    const source = `export const index = factory.createHandlers(async (c) => ok(c, []));
export const list = factory.createHandlers(async (c) => ok(c, []));`;
    const found = findHonoStyleViolations(HANDLER, source).map((v) => [v.rule, v.line]);
    expect(found).toEqual([["unknown-action", 2]]);
  });

  test("flags function declarations and re-exported names", () => {
    const fn = `export function archive() {}`;
    expect(rules(HANDLER, fn)).toEqual(["unknown-action"]);
    const reexport = `const x = factory.createHandlers(async (c) => ok(c, []));
export { x as approve };`;
    expect(rules(HANDLER, reexport)).toEqual(["unknown-action"]);
    const allowed = `const x = factory.createHandlers(async (c) => ok(c, []));
export { x as index };`;
    expect(rules(HANDLER, allowed)).toEqual([]);
  });

  test("allows the five actions", () => {
    const source = ["index", "show", "create", "update", "destroy"]
      .map((a) => `export const ${a} = factory.createHandlers(async (c) => ok(c, []));`)
      .join("\n");
    expect(rules(HANDLER, source)).toEqual([]);
  });
});

describe("action-method-mismatch", () => {
  test("flags GET /skills/:id served by index", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp().get("/skills/:id", ...skills.index);`;
    expect(findHonoStyleViolations(ROUTES, source)).toEqual([
      {
        path: ROUTES,
        line: 2,
        message: "GET /skills/:id に対応する action は show（実際: index）",
        rule: "action-method-mismatch"
      }
    ]);
  });

  test("flags POST/PUT/PATCH/DELETE with the wrong action", () => {
    const base = `import * as skills from "./handlers/skills";\nexport const r = factory.createApp()`;
    expect(rules(ROUTES, `${base}.post("/skills", ...skills.update);`)).toEqual([
      "action-method-mismatch"
    ]);
    expect(rules(ROUTES, `${base}.put("/skills/:id", ...skills.create);`)).toEqual([
      "action-method-mismatch"
    ]);
    expect(rules(ROUTES, `${base}.patch("/skills/:id", ...skills.create);`)).toEqual([
      "action-method-mismatch"
    ]);
    expect(rules(ROUTES, `${base}.delete("/skills/:id", ...skills.show);`)).toEqual([
      "action-method-mismatch"
    ]);
  });

  test("flags unsupported regex path params", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp().get("/skills/:id{[0-9]+}", ...skills.show);`;
    expect(findHonoStyleViolations(ROUTES, source)[0]).toMatchObject({
      message: "規約外のパスセグメント: skills/:id{[0-9]+}",
      rule: "action-method-mismatch"
    });
  });

  test("allows matching actions", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp()
  .get("/skills", ...skills.index)
  .get("/skills/:id", ...skills.show)
  .post("/skills", ...skills.create)
  .put("/skills/:id", ...skills.update)
  .patch("/skills/:id", ...skills.update)
  .delete("/skills/:id", ...skills.destroy);`;
    expect(rules(ROUTES, source)).toEqual([]);
  });
});

describe("handler-dir-mismatch", () => {
  test("flags POST /skills/:name/versions served from handlers/skills", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp().post("/skills/:name/versions", ...skills.create);`;
    expect(findHonoStyleViolations(ROUTES, source)).toEqual([
      {
        path: ROUTES,
        line: 2,
        message:
          "POST /skills/:name/versions に対応する handler ディレクトリは skill-versions（実際: skills）",
        rule: "handler-dir-mismatch"
      }
    ]);
  });

  test("flags a transition sub-resource in the wrong directory", () => {
    const source = `import * as versions from "./handlers/versions";
export const r = factory.createApp().post("/skills/:name/versions", ...versions.create);`;
    expect(findHonoStyleViolations(ROUTES, source)[0]).toMatchObject({
      message:
        "POST /skills/:name/versions に対応する handler ディレクトリは skill-versions（実際: versions）",
      rule: "handler-dir-mismatch"
    });
  });

  test("allows the derived directory, including a hyphenated parent", () => {
    const source = `import * as skillVersions from "./handlers/skill-versions";
import * as skillFiles from "./handlers/skill-files";
import * as skillVersionFiles from "./handlers/skill-version-files";
export const r = factory.createApp()
  .post("/skills/:name/versions", ...skillVersions.create)
  .get("/skills/:name/files", ...skillFiles.index)
  .get("/skill-versions/:name/files", ...skillVersionFiles.index);`;
    expect(rules(ROUTES, source)).toEqual([]);
  });
});

describe("unknown-inflection", () => {
  test("flags a segment the dictionary and rules cannot inflect", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp().post("/skills/:name/process", ...skills.create);`;
    expect(rules(ROUTES, source)).toEqual(["unknown-inflection"]);
  });

  test("flags an irregular word missing from the dictionary with guidance", () => {
    const source = `import * as skills from "./handlers/skills";
export const r = factory.createApp().get("/skills/:name/people", ...skills.index);`;
    const found = findHonoStyleViolations(ROUTES, source);
    expect(found.map((v) => v.rule)).toEqual(["unknown-inflection"]);
    expect(found[0].message).toContain("SINGULAR_TO_PLURAL");
  });

  test("keeps words already in the target form (versions / version / file)", () => {
    const source = `import * as skillVersions from "./handlers/skill-versions";
import * as skillFiles from "./handlers/skill-files";
export const r = factory.createApp()
  .get("/skills/:name/versions", ...skillVersions.index)
  .get("/skills/:name/files", ...skillFiles.index);`;
    expect(rules(ROUTES, source)).toEqual([]);
    const singularParent = `import * as skillFiles from "./handlers/skill-files";
export const r = factory.createApp().get("/skill/:name/files", ...skillFiles.index);`;
    expect(rules(ROUTES, singularParent)).toEqual([]);
    const versionParent = `import * as versionFiles from "./handlers/version-files";
export const r = factory.createApp().get("/version/:name/files", ...versionFiles.index);`;
    expect(rules(ROUTES, versionParent)).toEqual([]);
  });

  test("allows dictionary words", () => {
    const source = `import * as skillVersions from "./handlers/skill-versions";
export const r = factory.createApp().put("/skills/:name/version", ...skillVersions.update);`;
    expect(rules(ROUTES, source)).toEqual([]);
  });
});

describe("static-route-path", () => {
  test("flags imported constants and template literals with substitutions", () => {
    expect(
      rules(
        ROUTES,
        `import * as skills from "./handlers/skills";
import { SKILL_PATH } from "./paths";
export const r = factory.createApp().get(SKILL_PATH, ...skills.index);`
      )
    ).toEqual(["static-route-path"]);
    expect(
      rules(
        ROUTES,
        `import * as skills from "./handlers/skills";
const segment = "skills";
export const r = factory.createApp().get(\`/\${segment}\`, ...skills.index);`
      )
    ).toEqual(["static-route-path"]);
  });

  test("flags a same-file const path", () => {
    const source = `import * as skills from "./handlers/skills";
const P = "/skills";
export const r = factory.createApp().get(P, ...skills.index);`;
    expect(rules(ROUTES, source)).toEqual(["static-route-path"]);
  });

  test("allows string literals and plain template literals", () => {
    const head = `import * as skills from "./handlers/skills";\n`;
    expect(
      rules(ROUTES, `${head}export const r = factory.createApp().get("/skills", ...skills.index);`)
    ).toEqual([]);
    expect(
      rules(
        ROUTES,
        `${head}export const r = factory.createApp().get(\`/skills\`, ...skills.index);`
      )
    ).toEqual([]);
  });
});

describe("対象", () => {
  test("テストファイルと server 外は検査しない", () => {
    const source = `export const routes = new Hono<Env>().get("/", listItems);`;
    expect(findHonoStyleViolations("server/api/foo.test.ts", source)).toEqual([]);
    expect(findHonoStyleViolations("server/lib/x.ts", `const r = 1;`)).toEqual([]);
    expect(findHonoStyleViolations("app/x.ts", source)).toEqual([]);
  });

  test("allowlist に載ったパスは免除する", () => {
    expect(
      findHonoStyleViolations(
        "server/api/legacy.ts",
        `export const routes = new Hono<Env>().get("/", listItems);`,
        { allowlist: new Set(["server/api/legacy.ts"]) }
      )
    ).toEqual([]);
  });

  test("FILE_RULE は必須ルールで、ランナーで検出できる", () => {
    expect(FILE_RULE.optional).toBeUndefined();
    const result = runFileRules(
      ["server/api/protected/me.ts"],
      [FILE_RULE],
      () => `export const r = new Hono<Env>();`
    );
    expect(result.findings.length).toBe(1);
  });
});

import { describe, expect, test } from "bun:test";
import { findApiContractViolations } from "./lint-api-contract";

const HANDLER = "server/api/protected/skills/handlers/skills/index.ts";
const rules = (source: string, file = HANDLER) =>
  findApiContractViolations(file, source).map((v) => v.rule);

describe("lint:api-contract", () => {
  test("正例: 役割名と request 層からの import を満たす", () => {
    const source = `import { zValidator } from "@hono/zod-validator";
import { createSkillSchema, skillIdParamsSchema, skillListQuerySchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("param", skillIdParamsSchema),
  zValidator("query", skillListQuerySchema),
  zValidator("json", createSkillSchema),
  async (c) => ok(c, body)
);`;
    expect(rules(source)).toEqual([]);
  });

  test("正例: 別名 import と type import 混在は export 名で判定する", () => {
    const source = `import { type SkillInput, createSkillSchema as body } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(zValidator("json", body), async (c) => ok(c, 1));`;
    expect(rules(source)).toEqual([]);
  });

  test("違反: zValidator を別名 import しても検査をすり抜けない", () => {
    const source = `import { zValidator as v } from "@hono/zod-validator";
import { skillSchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  v("json", z.object({ name: z.string() })),
  v("json", skillSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role"]);
    const ok = `import { zValidator as v } from "@hono/zod-validator";
import { createSkillSchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(v("json", createSkillSchema), async (c) => ok(c, 1));`;
    expect(rules(ok)).toEqual([]);
  });

  test("違反: 役割名でない schema", () => {
    const source = `import { skillSchema, idSchema, filterSchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("param", idSchema),
  zValidator("query", filterSchema),
  zValidator("json", skillSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role", "request-role"]);
  });

  test("違反: request 層以外（dto・旧パス）からの import", () => {
    const source = `import { createSkillSchema } from "@/shared/schemas/skills/dto/skill";
import { skillIdParamsSchema } from "@/server/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("param", skillIdParamsSchema),
  zValidator("json", createSkillSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role"]);
  });

  test("違反: インライン z.object・動的 import・名前空間 import", () => {
    const source = `import * as req from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("json", z.object({ name: z.string() })),
  zValidator("json", req.createSkillSchema),
  zValidator("json", (await import("@/shared/schemas/skills/request/skill")).createSkillSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role", "request-role"]);
  });

  test("違反: form/header/cookie のインライン schema", () => {
    const source = `import { zValidator } from "@hono/zod-validator";
export const create = factory.createHandlers(
  zValidator("form", z.object({ name: z.string() })),
  zValidator("header", z.object({ x: z.string() })),
  zValidator("cookie", z.object({ x: z.string() })),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role", "request-role"]);
  });

  test("正例: form/header/cookie も request 層の役割名なら通す", () => {
    const source = `import { zValidator } from "@hono/zod-validator";
import { createSkillSchema, skillHeadersSchema, skillCookiesSchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("form", createSkillSchema),
  zValidator("header", skillHeadersSchema),
  zValidator("cookie", skillCookiesSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual([]);
  });

  test("違反: header の名前規則と form の動詞始まり", () => {
    const source = `import { zValidator } from "@hono/zod-validator";
import { skillHeaderSchema, skillSchema } from "@/shared/schemas/skills/request/skill";
export const create = factory.createHandlers(
  zValidator("header", skillHeaderSchema),
  zValidator("form", skillSchema),
  async (c) => ok(c, 1)
);`;
    expect(rules(source)).toEqual(["request-role", "request-role"]);
  });

  test("テストファイルと server/api 外は対象外", () => {
    expect(rules(`zValidator("json", x)`, "server/api/x.test.ts")).toEqual([]);
    expect(rules(`zValidator("json", x)`, "server/lib/http.ts")).toEqual([]);
  });
});

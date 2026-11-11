import { describe, expect, test } from "bun:test";
import { FILE_RULE, findSchemaLocationViolations } from "./lint-schema-location";

const find = (source: string, file = "server/services/skill-service/index.ts") =>
  findSchemaLocationViolations(file, source);

describe("lint:schema-location", () => {
  test("z.object などの定義を検出する", () => {
    expect(find(`import { z } from "zod";\nconst s = z.object({ a: z.string() });`)).toMatchObject([
      { line: 2, call: "z.object" },
      { line: 2, call: "z.string" }
    ]);
    expect(find(`import { z } from "zod";\nz.enum(["a"]);`)).toHaveLength(1);
  });

  test("namespace import・別名・名前付き import の定義も検出する", () => {
    expect(find(`import * as zod from "zod";\nzod.object({});`)).toMatchObject([
      { call: "zod.object" }
    ]);
    expect(find(`import { z as v } from "zod";\nv.array(v.number());`)).toHaveLength(2);
    expect(find(`import { object } from "zod";\nobject({});`)).toHaveLength(1);
    expect(find(`import { z } from "zod/v4";\nz.object({});`)).toHaveLength(1);
  });

  test("禁止した場所すべてを見る", () => {
    const src = `import { z } from "zod";\nz.object({});`;
    for (const file of [
      "server/lib/a/x.ts",
      "server/api/a/x.ts",
      "server/services/skill-service/x.ts",
      "server/repositories/skill-repository/x.ts",
      "server/middleware/x.ts",
      "app/lib/x.ts"
    ])
      expect(find(src, file)).toHaveLength(1);
  });

  test("shared/schemas と server/schemas では通す", () => {
    const src = `import { z } from "zod";\nz.object({});`;
    expect(find(src, "shared/schemas/skills.ts")).toEqual([]);
    expect(find(src, "server/schemas/skills/request/skill.ts")).toEqual([]);
  });

  test("型の導出や zod を使わない z は通す", () => {
    expect(
      find(
        `import { z } from "zod";\nimport type { S } from "@/shared/schemas/skills";\ntype T = z.infer<typeof S>;\nS.parse(1);`
      )
    ).toEqual([]);
    expect(find(`const z = { object: () => 1 };\nz.object();`)).toEqual([]);
  });

  test("FILE_RULE は AST を使い、テストと生成物を除く", () => {
    expect(FILE_RULE.ast).toBe(true);
    const inc = FILE_RULE.include as RegExp;
    expect(inc.test("server/services/skill-service/index.ts")).toBe(true);
    expect(inc.test("shared/schemas/skills.ts")).toBe(false);
    expect(FILE_RULE.exclude?.test("server/services/skill-service/index.test.ts")).toBe(true);
  });
});

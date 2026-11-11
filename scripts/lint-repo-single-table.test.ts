import { describe, expect, test } from "bun:test";
import { findRepoSingleTableViolations, repoSingleTableRule } from "./lint-repo-single-table";

const FILE = "server/repositories/skill-repository/index.ts";
const find = (source: string, file = FILE) => findRepoSingleTableViolations(file, source);

describe("lint:repo-single-table", () => {
  test("テーブルを 2 つ以上 import すると検出する", () => {
    const v = find(`import { skills, skillVersions } from "@/server/db/schema";`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      file: FILE,
      line: 1,
      rule: "multi-table",
      tables: ["skills", "skillVersions"]
    });
  });

  test("schema の別ファイルや複数 import の合計も数える", () => {
    const v = find(
      `import { skills } from "@/server/db/schema/skills";\nimport { skillFiles } from "@/server/db/schema/skill-files";`
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "multi-table", tables: ["skills", "skillFiles"] });
  });

  test("別名 import も元の名前で数え、同じテーブルの重複は 1 つ", () => {
    expect(
      find(`import { skills as r, skillVersions as s } from "@/server/db/schema";`)
    ).toHaveLength(1);
    expect(
      find(
        `import { skills } from "@/server/db/schema";\nimport { skills as r } from "@/server/db/schema/skills";`
      )
    ).toEqual([]);
  });

  test("namespace import を検出する", () => {
    const v = find(`import * as schema from "@/server/db/schema";`);
    expect(v).toMatchObject([{ rule: "namespace-import", line: 1 }]);
  });

  test("テーブル 1 つと type import は通す", () => {
    expect(
      find(
        `import type { SkillRow } from "@/server/db/schema";\nimport type { Foo } from "@/server/db/schema/skillVersions";\nimport { skills } from "@/server/db/schema";`
      )
    ).toEqual([]);
    expect(
      find(
        `import { skills, type SkillVersionRow, type NewSkillVersionRow } from "@/server/db/schema";`
      )
    ).toEqual([]);
  });

  test("理由付きの例外コメントがあれば通す", () => {
    const src = `// lint:allow-multi-table: 読み取りの集計で分けられない\nimport { skills, skillVersions } from "@/server/db/schema";`;
    expect(find(src)).toEqual([]);
  });

  test("例外コメントがあっても namespace import は検出する", () => {
    expect(
      find(`import * as s from "@/server/db/schema";\n// lint:allow-multi-table: 理由`)
    ).toMatchObject([{ rule: "namespace-import", line: 1 }]);
  });

  test("理由のない例外コメントは通さない", () => {
    const src = `// lint:allow-multi-table:\nimport { skills, skillVersions } from "@/server/db/schema";`;
    expect(find(src).map((v) => v.rule)).toEqual(["missing-reason", "multi-table"]);
    expect(
      find(
        `/* lint:allow-multi-table: 理由 */\nimport { skills, skillVersions } from "@/server/db/schema";`
      )
    ).toHaveLength(1);
  });

  test("同じディレクトリの別ファイルも見る", () => {
    const src = `import { skills, skillVersions } from "@/server/db/schema";`;
    expect(find(src, "server/repositories/skill-repository/helper.ts")).toHaveLength(1);
    expect(find(src, "server/repositories/skill-repository/sub/helper.ts")).toHaveLength(1);
  });

  test("テスト・repositories 以外は見ない", () => {
    const src = `import { skills, skillVersions } from "@/server/db/schema";`;
    expect(find(src, "server/repositories/skill-repository/index.test.ts")).toEqual([]);
    expect(find(src, "server/services/skill-service/index.ts")).toEqual([]);
  });

  test("repoSingleTableRule の対象は repository 配下の実装", () => {
    const rule = repoSingleTableRule();
    expect(rule.ast).toBe(true);
    const inc = rule.include as RegExp;
    expect(inc.test(FILE)).toBe(true);
    expect(inc.test("server/repositories/skill-repository/skill-files.ts")).toBe(true);
    expect(inc.test("server/repositories/skill-repository/index.test.ts")).toBe(false);
  });

  describe("フォルダ全体で 1 テーブル", () => {
    const run = (files: Record<string, string>) => {
      const rule = repoSingleTableRule();
      return Object.entries(files).flatMap(([f, src]) => rule.check(f, src));
    };
    const D = "server/repositories/skill-repository";
    const one = (t: string) => `import { ${t} } from "@/server/db/schema";`;

    test("helper.ts が 2 テーブルを import すると検出する", () => {
      expect(run({ [`${D}/helper.ts`]: one("skills, skillVersions") })).toMatchObject([
        { rule: "multi-table", tables: ["skills", "skillVersions"] }
      ]);
    });

    test("index.ts と別ファイルで別のテーブルを 1 つずつ import しても検出する", () => {
      const v = run({ [`${D}/index.ts`]: one("skills"), [`${D}/helper.ts`]: one("skillVersions") });
      expect(v).toMatchObject([{ file: `${D}/helper.ts`, rule: "multi-table" }]);
      expect(v).toHaveLength(1);
    });

    test("同じテーブルなら別ファイルでも通す", () => {
      expect(run({ [`${D}/index.ts`]: one("skills"), [`${D}/helper.ts`]: one("skills") })).toEqual(
        []
      );
    });

    test("例外コメントのあるファイルは合計から外す", () => {
      const allowed = `// lint:allow-multi-table: 理由\n${one("skillVersions")}`;
      expect(run({ [`${D}/index.ts`]: one("skills"), [`${D}/helper.ts`]: allowed })).toEqual([]);
    });

    test("テストファイルは合計に入れない", () => {
      expect(
        run({ [`${D}/index.ts`]: one("skills"), [`${D}/index.test.ts`]: one("skillVersions") })
      ).toEqual([]);
    });

    test("別のフォルダは別に数える", () => {
      expect(
        run({
          [`${D}/index.ts`]: one("skills"),
          "server/repositories/version-repository/index.ts": one("skillVersions")
        })
      ).toEqual([]);
    });
  });
});

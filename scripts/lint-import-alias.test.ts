import { describe, expect, test } from "bun:test";
import { FILE_RULE, findImportAliasViolations } from "./lint-import-alias";

const file = "server/lib/a.ts";
const rules = (source: string, f = file) => findImportAliasViolations(f, source).map((v) => v.rule);

describe("lint:import-alias", () => {
  test("../ を検出し、直し方を出す", () => {
    const v = findImportAliasViolations(file, 'import { x } from "../x";');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ file, line: 1, rule: "relative-parent", importedPath: "../x" });
    expect(v[0]?.message).toContain("@/");
  });

  test("旧エイリアスを検出する", () => {
    expect(rules('import { x } from "~/x";')).toEqual(["legacy-alias"]);
    expect(rules('import { x } from "@server/x";')).toEqual(["legacy-alias"]);
    expect(rules('import { x } from "@shared/x";')).toEqual(["legacy-alias"]);
    expect(rules('import { x } from "@test/x";')).toEqual(["legacy-alias"]);
    expect(rules('import { x } from "@ext/x";')).toEqual(["legacy-alias"]);
  });

  test("./x と @/ は通す", () => {
    expect(rules('import { x } from "./x";')).toEqual([]);
    expect(rules('import { x } from "@/server/x";')).toEqual([]);
    expect(rules('import type { X } from "@/shared/x";')).toEqual([]);
  });

  test("import()・export from・mock.module・type import も見る", () => {
    expect(rules('const m = await import("../x");')).toEqual(["relative-parent"]);
    expect(rules('export * from "../x";')).toEqual(["relative-parent"]);
    expect(rules('export { a } from "../x";')).toEqual(["relative-parent"]);
    expect(rules('import type { X } from "../x";')).toEqual(["relative-parent"]);
    expect(rules('mock.module("../x", () => ({}));')).toEqual(["relative-parent"]);
    expect(rules('mock.module("~/x", () => ({}));')).toEqual(["legacy-alias"]);
  });

  test("コメントや無関係な文字列の ../ は通す", () => {
    expect(rules('// import "../x"\nconst a = "../x";\n/* from "~/x" */')).toEqual([]);
  });

  test("対象外のファイルは見ない", () => {
    expect(rules('import "../x";', "app/routeTree.gen.ts")).toEqual([]);
    expect(rules('import "../x";', "docs/a.ts")).toEqual([]);
    expect(rules('import "../x";', "tests/fixtures/deps/a/app/a.ts")).toEqual([]);
    expect(rules('import "../x";', "tests/helpers/a.ts")).toEqual(["relative-parent"]);
  });

  test("FILE_RULE は .ts / .tsx だけを対象にする", () => {
    expect(FILE_RULE.include).toBeInstanceOf(RegExp);
    expect((FILE_RULE.include as RegExp).test("app/a.tsx")).toBe(true);
    expect((FILE_RULE.include as RegExp).test("app/a.css")).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { FILE_RULE, findNoTypeProgramViolations } from "./lint-no-type-program";

const find = (source: string, file = "scripts/lint-x.ts") =>
  findNoTypeProgramViolations(file, source);

describe("lint:no-type-program", () => {
  test("createProgram / getTypeChecker の呼び出しを検出する", () => {
    expect(find(`const p = ts.createProgram(files, opts);`)).toMatchObject([
      { line: 1, name: "createProgram" }
    ]);
    expect(find(`const c = program.getTypeChecker();`)).toMatchObject([{ name: "getTypeChecker" }]);
  });

  test("別名 import・分割代入も検出する", () => {
    expect(
      find(`import { createProgram as cp } from "typescript";\ncp(files, opts);`)
    ).toMatchObject([{ line: 1, name: "createProgram" }]);
    expect(find(`const { getTypeChecker } = program;`)).toHaveLength(1);
  });

  test("文字列やコメントに書いてあるだけなら通す", () => {
    expect(find(`const a = "createProgram";\n// getTypeChecker は使わない`)).toEqual([]);
    expect(find(`import { parseTypeScript } from "./lib/lint-ast";`)).toEqual([]);
  });

  test("対象は scripts の lint 実装で、テストは見ない", () => {
    const inc = FILE_RULE.include as RegExp;
    expect(FILE_RULE.ast).toBe(true);
    expect(inc.test("scripts/lint-x.ts")).toBe(true);
    expect(inc.test("scripts/lib/lint-ast.ts")).toBe(true);
    expect(inc.test("scripts/lint/no-input-value.ts")).toBe(true);
    expect(inc.test("scripts/deploy-check.ts")).toBe(false);
    expect(FILE_RULE.exclude?.test("scripts/lint-x.test.ts")).toBe(true);
    expect(find(`program.getTypeChecker();`, "app/x.ts")).toEqual([]);
  });
});

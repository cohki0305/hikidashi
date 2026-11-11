import { describe, expect, test } from "bun:test";
import { findFixtureImportViolations } from "./lint-no-fixture-runtime-import";

const file = "server/services/a-service/index.ts";

describe("lint:no-fixture-runtime-import", () => {
  test("tests/fixtures の import を別名・相対・動的・re-export で検出する", () => {
    expect(findFixtureImportViolations(file, 'import { a } from "@/tests/fixtures/a";')).toEqual([
      { file, line: 1, importedPath: "@/tests/fixtures/a" }
    ]);
    expect(
      findFixtureImportViolations(file, 'import * as f from "@/tests/fixtures";')
    ).toHaveLength(1);
    expect(
      findFixtureImportViolations(file, 'import a from "../../../tests/fixtures/a";')
    ).toHaveLength(1);
    expect(
      findFixtureImportViolations(file, 'const m = await import("@/tests/fixtures/a");')
    ).toHaveLength(1);
    expect(findFixtureImportViolations(file, 'export * from "@/tests/fixtures/a";')).toHaveLength(
      1
    );
  });

  test("server/x.ts が @/tests/fixtures/y を import すると違反", () => {
    expect(
      findFixtureImportViolations("server/x.ts", 'import { y } from "@/tests/fixtures/y";')
    ).toEqual([{ file: "server/x.ts", line: 1, importedPath: "@/tests/fixtures/y" }]);
  });

  test("型だけの import は共通判定に従って通す", () => {
    expect(
      findFixtureImportViolations(file, 'import type { A } from "@/tests/fixtures/a";')
    ).toEqual([]);
  });

  test("テストと無関係な import は 0 件", () => {
    expect(
      findFixtureImportViolations("server/a.test.ts", 'import a from "@/tests/fixtures/a";')
    ).toEqual([]);
    expect(
      findFixtureImportViolations(
        file,
        'import a from "@/tests/helpers/a";\nimport b from "../tests-fixtures/b";'
      )
    ).toEqual([]);
  });
});

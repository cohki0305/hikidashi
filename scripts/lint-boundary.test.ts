import { describe, expect, test } from "bun:test";
import { FILE_RULE, findBoundaryViolations } from "./lint-boundary";

const file = "app/hooks/use-a/index.ts";

describe("lint:boundary", () => {
  test("app から server の値 import を検出する", () => {
    expect(findBoundaryViolations(file, 'import { a } from "@/server/lib/a";')).toEqual([
      { file, line: 1, importedPath: "@/server/lib/a" }
    ]);
    expect(findBoundaryViolations(file, 'import { a } from "../../../server/lib/a";')).toHaveLength(
      1
    );
    expect(findBoundaryViolations(file, 'import * as s from "@/server/x";')).toHaveLength(1);
    expect(findBoundaryViolations(file, 'import "@/server/x";')).toHaveLength(1);
    expect(findBoundaryViolations(file, 'const m = await import("@/server/x");')).toHaveLength(1);
    expect(findBoundaryViolations(file, 'export { a } from "@/server/x";')).toHaveLength(1);
  });

  test("app/x.ts が @/server/app を値 import すると違反", () => {
    const target = "app/x.ts";
    expect(findBoundaryViolations(target, 'import { app } from "@/server/app";')).toEqual([
      { file: target, line: 1, importedPath: "@/server/app" }
    ]);
  });

  test("type 混在でも値が含まれれば検出する", () => {
    expect(findBoundaryViolations(file, 'import { type A, b } from "@/server/x";')).toHaveLength(1);
  });

  test("type-only は通す", () => {
    expect(findBoundaryViolations(file, 'import type { A } from "@/server/x";')).toEqual([]);
    expect(findBoundaryViolations(file, 'import { type A } from "@/server/x";')).toEqual([]);
    expect(findBoundaryViolations(file, 'export type { A } from "@/server/x";')).toEqual([]);
  });

  test("shared・app 内・テスト・app 以外は 0 件", () => {
    expect(
      findBoundaryViolations(file, 'import { a } from "@/shared/schemas/a";\nimport b from "../b";')
    ).toEqual([]);
    expect(findBoundaryViolations("app/a.test.ts", 'import a from "@/server/x";')).toEqual([]);
    expect(findBoundaryViolations("server/a.ts", 'import a from "@/server/x";')).toEqual([]);
  });

  test("FILE_RULE は app のテスト以外を対象にする", () => {
    const include = FILE_RULE.include as RegExp;
    expect(include.test("app/hooks/a/index.ts")).toBe(true);
    expect(include.test("app/x.ts")).toBe(true);
    expect(include.test("server/a.ts")).toBe(false);
    expect(FILE_RULE.exclude?.test("app/a.test.ts")).toBe(true);
  });
});

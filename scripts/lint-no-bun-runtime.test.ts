import { describe, expect, test } from "bun:test";
import { FILE_RULE, findBunRuntimeViolations } from "./lint-no-bun-runtime";

const file = "server/lib/hash.ts";

describe("lint:no-bun-runtime", () => {
  test("Bun.* の使用を検出する", () => {
    const v = findBunRuntimeViolations(file, 'export const h = new Bun.CryptoHasher("sha256");\n');
    expect(v).toEqual([{ file, line: 1, api: "Bun.CryptoHasher" }]);
    expect(findBunRuntimeViolations(file, "globalThis.Bun.file('a');")).toHaveLength(1);
  });

  test("shared/x.ts で Bun.file は違反", () => {
    expect(findBunRuntimeViolations("shared/x.ts", 'Bun.file("a");')).toEqual([
      { file: "shared/x.ts", line: 1, api: "Bun.file" }
    ]);
  });

  test("bun: import を静的・動的・re-export・require で検出する", () => {
    expect(findBunRuntimeViolations(file, 'import { Database } from "bun:sqlite";')).toHaveLength(
      1
    );
    expect(findBunRuntimeViolations(file, 'import * as b from "bun";')).toHaveLength(1);
    expect(findBunRuntimeViolations(file, 'const m = await import("bun:ffi");')).toHaveLength(1);
    expect(findBunRuntimeViolations(file, 'export * from "bun:test";')).toHaveLength(1);
    expect(findBunRuntimeViolations(file, 'const m = require("bun:sqlite");')).toHaveLength(1);
  });

  test("shared も対象で、type import だけの bun: は通す", () => {
    expect(findBunRuntimeViolations("shared/a.ts", "Bun.env.A;")).toHaveLength(1);
    expect(findBunRuntimeViolations(file, 'import type { Server } from "bun";')).toEqual([]);
    expect(findBunRuntimeViolations(file, 'import { type Server } from "bun";')).toEqual([]);
  });

  test("正例・テスト・対象外は 0 件", () => {
    expect(
      findBunRuntimeViolations(
        file,
        'import { createHash } from "node:crypto";\nconst Bunny = 1;\nBunny.x;\n'
      )
    ).toEqual([]);
    expect(findBunRuntimeViolations("server/a.test.ts", "Bun.env.A;")).toEqual([]);
    expect(findBunRuntimeViolations("scripts/a.ts", "Bun.env.A;")).toEqual([]);
    expect(FILE_RULE.exclude instanceof RegExp && FILE_RULE.exclude.test("shared/a.test.ts")).toBe(
      true
    );
  });

  test("FILE_RULE は server・shared のテスト以外を対象にする", () => {
    const include = FILE_RULE.include as RegExp;
    expect(include.test("server/lib/a.ts")).toBe(true);
    expect(include.test("shared/a.ts")).toBe(true);
    expect(include.test("scripts/a.ts")).toBe(false);
  });
});

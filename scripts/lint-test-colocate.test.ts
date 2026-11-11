import { describe, expect, test } from "bun:test";
import {
  findTestColocateViolations,
  MISSING_TEST_EXEMPT,
  testColocateRule
} from "./lint-test-colocate";

const rules = (file: string, files: string[]) =>
  findTestColocateViolations(file, files).map((v) => v.rule);

describe("lint:test-colocate", () => {
  test("tests/ 配下のテストを検出し、tests/helpers は例外にする", () => {
    expect(rules("tests/a.test.ts", ["tests/a.test.ts"])).toEqual(["test-in-tests-dir"]);
    expect(rules("tests/x/b.test.tsx", [])).toEqual(["test-in-tests-dir"]);
    expect(rules("tests/helpers/a.test.ts", [])).toEqual([]);
  });

  test("フラットな実装を検出する", () => {
    expect(rules("server/services/user-service.ts", [])).toEqual(["flat-file"]);
    expect(rules("server/repositories/user-repository.ts", [])).toEqual(["flat-file"]);
    expect(rules("server/api/users/handlers/list.ts", [])).toEqual(["flat-file"]);
    expect(rules("app/hooks/use-user.ts", [])).toEqual(["flat-file"]);
    expect(rules("app/hooks/use-user.tsx", [])).toEqual(["flat-file"]);
  });

  test("index.ts の隣に index.test.ts が無ければ検出する", () => {
    const impl = "server/services/user-service/index.ts";
    expect(rules(impl, [impl])).toEqual(["missing-test"]);
    expect(rules("app/hooks/use-user/index.ts", [])).toEqual(["missing-test"]);
    expect(rules("server/api/users/handlers/list/index.ts", [])).toEqual(["missing-test"]);
    expect(rules("server/repositories/user-repository/index.ts", [])).toEqual(["missing-test"]);
  });

  test("どの実装も隣にテストが無ければ missing-test", () => {
    expect(rules("server/lib/x.ts", [])).toEqual(["missing-test"]);
    expect(rules("app/components/y.tsx", ["app/components/y.tsx"])).toEqual(["missing-test"]);
    expect(rules("shared/schemas/a.ts", [])).toEqual(["missing-test"]);
    expect(rules("scripts/a.ts", [])).toEqual(["missing-test"]);
  });

  test("隣にテストがあれば 0 件", () => {
    expect(rules("app/components/y.tsx", ["app/components/y.test.tsx"])).toEqual([]);
    expect(rules("server/lib/x.ts", ["server/lib/x.test.ts"])).toEqual([]);
    const impl = "server/services/user-service/index.ts";
    expect(rules(impl, [impl, "server/services/user-service/index.test.ts"])).toEqual([]);
  });

  test("実装の無いテストは missing-implementation", () => {
    expect(rules("server/lib/foo.test.ts", ["server/lib/foo.test.ts"])).toEqual([
      "missing-implementation"
    ]);
    expect(rules("app/a/foo.test.tsx", [])).toEqual(["missing-implementation"]);
    expect(rules("server/lib/foo.test.ts", ["server/lib/foo.ts"])).toEqual([]);
    expect(rules("app/a/foo.test.tsx", ["app/a/foo.tsx"])).toEqual([]);
    expect(rules("app/a/foo.test.ts", ["app/a/foo.tsx"])).toEqual([]);
  });

  test("除外の一覧のパスは missing-test を出さない", () => {
    for (const f of [
      "shared/types.ts",
      "app/vite-env.d.ts",
      "app/main.tsx",
      "server/entry/scheduled.ts",
      "vite.config.ts",
      "app/routeTree.gen.ts",
      "server/db/schema/auth.ts"
    ])
      expect(rules(f, [])).toEqual([]);
    expect(MISSING_TEST_EXEMPT.every((e) => e.reason.length > 0)).toBe(true);
  });

  test("tests/helpers と tests/fixtures は対象外", () => {
    expect(rules("tests/helpers/a.ts", [])).toEqual([]);
    expect(rules("tests/helpers/a.test.ts", [])).toEqual([]);
    expect(rules("tests/fixtures/a.ts", [])).toEqual([]);
  });

  test("ルールは対象外のファイルを読まない", () => {
    const rule = testColocateRule([]);
    const hit = (f: string) => (typeof rule.include === "function" ? rule.include(f) : false);
    expect(hit("server/services/a-service/index.ts")).toBe(true);
    expect(hit("tests/a.test.ts")).toBe(true);
    expect(hit("server/lib/result.ts")).toBe(true);
    expect(hit("tests/helpers/a.ts")).toBe(false);
    expect(hit("docs/a.ts")).toBe(false);
  });
});

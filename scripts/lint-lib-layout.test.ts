import { describe, expect, test } from "bun:test";
import { FILE_RULE, findLibLayoutViolations } from "./lint-lib-layout";

describe("lint:lib-layout", () => {
  test("許可外の直下ファイルを検出する", () => {
    expect(findLibLayoutViolations("app/lib/date-format.ts")).toHaveLength(1);
    expect(findLibLayoutViolations("app/lib/order.tsx")).toHaveLength(1);
    expect(findLibLayoutViolations("app/lib/auth.ts")).toHaveLength(1);
    expect(findLibLayoutViolations("server/lib/auth.ts")).toHaveLength(1);
    expect(findLibLayoutViolations("server/lib/auth.test.ts")).toHaveLength(1);
  });

  test("許可された直下ファイルとそのテストは通す", () => {
    for (const f of [
      "app/lib/api.ts",
      "app/lib/utils.ts",
      "app/lib/api.test.ts",
      "app/lib/auth-client.ts"
    ])
      expect(findLibLayoutViolations(f)).toEqual([]);
    for (const f of ["server/lib/result.ts", "server/lib/http.ts", "server/lib/http.test.ts"])
      expect(findLibLayoutViolations(f)).toEqual([]);
  });

  test("lib/{domain}/ 配下と lib 以外は見ない", () => {
    expect(findLibLayoutViolations("app/lib/order/queries.ts")).toEqual([]);
    expect(findLibLayoutViolations("app/lib/browser/storage.ts")).toEqual([]);
    expect(findLibLayoutViolations("server/lib/order/x.ts")).toEqual([]);
    expect(findLibLayoutViolations("shared/lib/x.ts")).toEqual([]);
  });

  test("api.ts は server/lib では許可されない", () => {
    expect(findLibLayoutViolations("server/lib/api.ts")).toHaveLength(1);
    expect(findLibLayoutViolations("app/lib/result.ts")).toHaveLength(1);
  });

  test("FILE_RULE の対象は lib 直下", () => {
    const inc = FILE_RULE.include as RegExp;
    expect(inc.test("app/lib/x.ts")).toBe(true);
    expect(inc.test("app/lib/x/y.ts")).toBe(false);
  });
});

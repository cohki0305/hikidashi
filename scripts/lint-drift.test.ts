import { describe, expect, test } from "bun:test";
import { FILE_RULE, findDriftViolations } from "./lint-drift";

describe("lint:drift", () => {
  test("-repository で終わらない repositories 直下の名前を検出する", () => {
    expect(findDriftViolations("server/repositories/skill-metadata/index.ts")).toEqual([
      {
        file: "server/repositories/skill-metadata/index.ts",
        name: "skill-metadata",
        suffix: "-repository"
      }
    ]);
    expect(findDriftViolations("server/repositories/foo.ts")).toHaveLength(1);
  });

  test("-service で終わらない services 直下の名前を検出する", () => {
    expect(findDriftViolations("server/services/skill/index.test.ts")).toEqual([
      { file: "server/services/skill/index.test.ts", name: "skill", suffix: "-service" }
    ]);
  });

  test("正しい名前は通す", () => {
    expect(findDriftViolations("server/repositories/skill-repository/index.ts")).toEqual([]);
    expect(findDriftViolations("server/services/skill-service/index.test.ts")).toEqual([]);
    expect(findDriftViolations("server/lib/x/index.ts")).toEqual([]);
  });

  test("FILE_RULE の対象は repositories と services 配下", () => {
    const inc = FILE_RULE.include as RegExp;
    expect(inc.test("server/repositories/a/index.ts")).toBe(true);
    expect(inc.test("server/services/a/index.ts")).toBe(true);
    expect(inc.test("server/api/a.ts")).toBe(false);
  });
});

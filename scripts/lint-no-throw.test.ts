import { describe, expect, test } from "bun:test";
import { FILE_RULE, findNoThrowViolations } from "./lint-no-throw";

const message = "Service / lib では throw せず Result を返す";

describe("lint:no-throw", () => {
  test("services と lib の throw を検出する", () => {
    expect(
      findNoThrowViolations(
        "server/services/skill-service/index.ts",
        `export function run() {
  throw new Error("failed");
}`
      )
    ).toEqual([{ file: "server/services/skill-service/index.ts", line: 2, message }]);
    expect(findNoThrowViolations("server/lib/example.ts", `const f = () => { throw 1; };`)).toEqual(
      [{ file: "server/lib/example.ts", line: 1, message }]
    );
  });

  test("クラスメソッドや try の中の throw も検出する", () => {
    const source = `export class A {
  run() {
    try {
      return 1;
    } catch (e) {
      throw e;
    }
  }
}`;
    expect(findNoThrowViolations("server/services/a-service/index.ts", source)).toHaveLength(1);
  });

  test("対象外の層とテストは見ない", () => {
    expect(
      findNoThrowViolations(
        "server/repositories/skill-repository/index.ts",
        `throw new Error("db");`
      )
    ).toEqual([]);
    expect(
      findNoThrowViolations("server/services/skill-service/index.test.ts", `throw new Error("t");`)
    ).toEqual([]);
  });

  test("コメントや文字列中の throw、Result を返す正例は 0 件", () => {
    expect(
      findNoThrowViolations(
        "server/lib/example.ts",
        `// throw new Error("comment")
const text = "throw new Error";
export const f = () => ({ ok: false, kind: "invalid", message: "x" });`
      )
    ).toEqual([]);
  });

  test("FILE_RULE の対象は services と lib のテスト以外", () => {
    const hit = (file: string) =>
      typeof FILE_RULE.include === "function"
        ? FILE_RULE.include(file)
        : FILE_RULE.include.test(file);
    expect(hit("server/services/a-service/index.ts")).toBe(true);
    expect(hit("server/lib/http.ts")).toBe(true);
    expect(hit("server/api/x.ts")).toBe(false);
    expect(FILE_RULE.optional).toBeUndefined();
  });
});

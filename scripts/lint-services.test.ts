import { describe, expect, test } from "bun:test";
import { FILE_RULE, findServiceClassViolations, findServiceSizeViolations } from "./lint-services";

const lines = (n: number) => `${"const a = 1;\n".repeat(n)}`;

describe("lint:services", () => {
  test("301 行以上を検出する", () => {
    expect(findServiceSizeViolations("server/services/skill-service/index.ts", lines(301))).toEqual(
      [{ file: "server/services/skill-service/index.ts", lines: 301, max: 300 }]
    );
  });

  test("サブファイルも対象にする", () => {
    expect(
      findServiceSizeViolations("server/services/skill-service/helper.ts", lines(400))
    ).toHaveLength(1);
  });

  test("300 行ちょうどは 0 件で、末尾改行は数えない", () => {
    expect(findServiceSizeViolations("server/services/skill-service/index.ts", lines(300))).toEqual(
      []
    );
    expect(
      findServiceSizeViolations("server/services/skill-service/index.ts", lines(300).trimEnd())
    ).toEqual([]);
  });

  test("テストと services 以外は見ない", () => {
    expect(
      findServiceSizeViolations("server/services/skill-service/index.test.ts", lines(500))
    ).toEqual([]);
    expect(findServiceSizeViolations("server/lib/x.ts", lines(500))).toEqual([]);
  });

  test("FILE_RULE の対象は services 配下のテスト以外", () => {
    const hit = (file: string) =>
      typeof FILE_RULE.include === "function"
        ? FILE_RULE.include(file)
        : FILE_RULE.include.test(file);
    expect(hit("server/services/skill-service/index.ts")).toBe(true);
    expect(FILE_RULE.exclude?.test("server/services/skill-service/index.test.ts")).toBe(true);
    expect(FILE_RULE.optional).toBe(true);
  });

  describe("{X}Service class の export", () => {
    const FILE = "server/services/skill-service/index.ts";
    const find = (source: string, file = FILE) => findServiceClassViolations(file, source);

    test("class を export していない index.ts を検出する", () => {
      expect(find(`export const a = 1;`)).toEqual([
        { file: FILE, expected: "SkillService", rule: "service-class-not-exported" }
      ]);
      expect(find(`export class Other {}`)).toHaveLength(1);
      expect(find(`export const SkillService = 1;`)).toHaveLength(1);
      expect(find(`export function SkillService() {}`)).toHaveLength(1);
    });

    test("export class と、宣言した class の後置 export は通す", () => {
      expect(find(`export class SkillService {}`)).toEqual([]);
      expect(find(`class SkillService {}\nexport { SkillService };`)).toEqual([]);
      expect(find(`class Impl {}\nexport { Impl as SkillService };`)).toEqual([]);
      expect(find(`export default class SkillService {}`)).toHaveLength(1);
    });

    test("index.ts 以外・テスト・services 以外は見ない", () => {
      expect(find(`export const a = 1;`, "server/services/skill-service/helper.ts")).toEqual([]);
      expect(find(`export const a = 1;`, "server/services/skill-service/index.test.ts")).toEqual(
        []
      );
      expect(find(`export const a = 1;`, "server/lib/x/index.ts")).toEqual([]);
    });

    test("FILE_RULE は AST を使う", () => {
      expect(FILE_RULE.ast).toBe(true);
    });
  });
});

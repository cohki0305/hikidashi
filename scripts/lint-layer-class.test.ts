import { describe, expect, test } from "bun:test";
import { FILE_RULE, findLayerClassViolations } from "./lint-layer-class";

const svc = "server/services/skill-service/index.ts";
const repo = "server/repositories/skill-repository/index.ts";

describe("lint:layer-class", () => {
  test("service の index.ts に {Name}Service が無ければ検出する", () => {
    expect(findLayerClassViolations(svc, `export function makeSkillService() {}`)).toEqual([
      { file: svc, line: 1, rule: "layer-must-export-class", expected: "SkillService" }
    ]);
    expect(findLayerClassViolations(svc, `export class Other {}`)).toHaveLength(1);
    expect(findLayerClassViolations(svc, `class SkillService {}`)).toHaveLength(1);
  });

  test("repository の index.ts に {Table}Repository が無ければ検出する", () => {
    expect(findLayerClassViolations(repo, `export class SkillVersionRepository {}`)).toEqual([
      {
        file: repo,
        line: 1,
        rule: "layer-must-export-class",
        expected: "SkillRepository"
      }
    ]);
  });

  test("export class・export { X } のどちらも正例", () => {
    expect(findLayerClassViolations(svc, `export class SkillService {}`)).toEqual([]);
    expect(findLayerClassViolations(repo, `export class SkillRepository {}`)).toEqual([]);
    expect(
      findLayerClassViolations(svc, `class SkillService {}\nexport { SkillService };`)
    ).toEqual([]);
    expect(
      findLayerClassViolations(svc, `class Impl {}\nexport { Impl as SkillService };`)
    ).toEqual([]);
  });

  test("モジュール直下で他層をインスタンス化すると検出する", () => {
    const source = `import { SkillRepository } from "@/server/repositories/skill-repository";
export class SkillService {}
const repo = new SkillRepository(db);`;
    expect(findLayerClassViolations(svc, source)).toEqual([
      { file: svc, line: 3, rule: "module-level-instance", expected: "SkillRepository" }
    ]);
  });

  test("別名 import・名前空間・式の中でも検出する", () => {
    const base = `export class SkillService {}\n`;
    expect(
      findLayerClassViolations(
        svc,
        `import { SkillRepository as R } from "x";\n${base}export const r = new R(db);`
      ).map((v) => v.rule)
    ).toEqual(["module-level-instance"]);
    expect(
      findLayerClassViolations(
        svc,
        `import * as m from "x";\n${base}const r = new m.SkillRepository(1);`
      )
    ).toHaveLength(1);
    expect(
      findLayerClassViolations(svc, `${base}export default { s: new NotifierService() };`)
    ).toHaveLength(1);
  });

  test("関数・クラスの内側のインスタンス化は正例", () => {
    const source = `export class SkillService {
  constructor(private repo: SkillRepository) {}
  build() { return new SkillRepository(this.db); }
}
export const make = (db: D) => new SkillService(new SkillRepository(db));`;
    expect(findLayerClassViolations(svc, source)).toEqual([]);
  });

  test("index.ts 以外はクラス export を求めず、テストは見ない", () => {
    expect(
      findLayerClassViolations("server/services/skill-service/helper.ts", `export const a = 1;`)
    ).toEqual([]);
    expect(
      findLayerClassViolations("server/services/skill-service/index.test.ts", `new XService()`)
    ).toEqual([]);
    expect(findLayerClassViolations("server/lib/a.ts", `new XService()`)).toEqual([]);
  });

  test("FILE_RULE の対象は services と repositories のテスト以外", () => {
    const hit = (file: string) =>
      typeof FILE_RULE.include === "function"
        ? FILE_RULE.include(file)
        : FILE_RULE.include.test(file);
    expect(hit(svc)).toBe(true);
    expect(hit(repo)).toBe(true);
    expect(hit("server/lib/http.ts")).toBe(false);
    expect(FILE_RULE.ast).toBe(true);
  });
});

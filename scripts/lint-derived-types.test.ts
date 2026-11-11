import { describe, expect, test } from "bun:test";
import { FILE_RULE, findDerivedTypeViolations } from "./lint-derived-types";

const find = (source: string, file = "server/services/a-service/index.ts") =>
  findDerivedTypeViolations(file, source);

describe("lint:derived-types", () => {
  test("リネームだけの type A = B を検出する", () => {
    expect(find(`type A = B;`)).toMatchObject([{ line: 1, rule: "rename-only", name: "A" }]);
    expect(find(`export type A = ns.B;`)).toMatchObject([{ rule: "rename-only" }]);
  });

  test("手書きの Request / Response / Body / Dto を検出する", () => {
    for (const name of ["FooRequest", "FooResponse", "FooBody", "FooDto"]) {
      expect(find(`export type ${name} = { a: string };`)).toMatchObject([
        { rule: "hand-written-dto", name }
      ]);
      expect(find(`export interface ${name} { a: string }`)).toMatchObject([
        { rule: "hand-written-dto", name }
      ]);
    }
    expect(find(`type X = { a: string } & Y;\ntype FooDto = X & { b: number };`)).toHaveLength(1);
  });

  test("z.infer などで導出した型は通す", () => {
    expect(
      find(
        `export type FooRequest = z.infer<typeof fooRequest>;\nexport type FooDto = z.output<typeof s>;\nexport type FooBody = zod.input<typeof s>;`
      )
    ).toEqual([]);
  });

  test("型引数付きや合成・リテラルの型は通す", () => {
    expect(
      find(`type A = Array<B>;\ntype C = B | undefined;\ntype D = "a" | "b";\ntype E = { a: B };`)
    ).toEqual([]);
    expect(find(`type A = ReturnType<typeof f>;`)).toEqual([]);
  });

  test("直前の行に理由付きの例外コメントがあれば、手書きを通す", () => {
    expect(
      find(
        `// lint:allow-hand-written-dto: 外部サービスの応答の形\ntype FooResponse = { a: string };\n// lint:allow-hand-written-dto: 外部サービスの応答の形\nexport interface BarResponse { a: string }`
      )
    ).toEqual([]);
  });

  test("理由のない例外コメントや、離れた例外コメントは通さない", () => {
    expect(
      find(`// lint:allow-hand-written-dto:\ntype FooResponse = { a: string };`)
    ).toMatchObject([{ rule: "missing-reason", name: "FooResponse" }]);
    expect(
      find(`// lint:allow-hand-written-dto: 理由\n\ntype FooResponse = { a: string };`)
    ).toMatchObject([{ rule: "hand-written-dto" }]);
  });

  test("リネームだけの型は例外コメントがあっても通さない", () => {
    expect(find(`// lint:allow-hand-written-dto: 理由\ntype A = B;`)).toMatchObject([
      { rule: "rename-only" }
    ]);
  });

  test("Request / Response で終わらない名前の手書きは通す", () => {
    expect(find(`type RequestContext = { a: string };\ntype Row = { a: string };`)).toEqual([]);
  });

  test("テストと生成物は見ない", () => {
    expect(FILE_RULE.ast).toBe(true);
    expect(FILE_RULE.exclude?.test("server/a.test.ts")).toBe(true);
    expect(find(`type A = B;`, "app/routeTree.gen.ts")).toEqual([]);
    expect(find(`type A = B;`, "docs/x.ts")).toEqual([]);
  });
});

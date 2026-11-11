import { expect, test } from "bun:test";
import { type ParsedSource, parseTypeScript } from "./lint-ast";
import { type FileRule, runFileRules } from "./lint-runner-engine";

test("同じファイルを見る AST ルールは 1 回だけ解析し、同じ AST を受け取る", () => {
  const seen: (ParsedSource | undefined)[] = [];
  let parseCalls = 0;
  let reads = 0;
  const check: FileRule = {
    include: /\.ts$/,
    ast: true,
    check(_file, _source, ast) {
      seen.push(ast);
      return [];
    }
  };
  const result = runFileRules(
    ["a.ts", "b.ts"],
    [check, { ...check }, { include: /\.ts$/, check: () => [] }],
    () => {
      reads++;
      return "const a = 1";
    },
    {
      parse: (file, source) => {
        parseCalls++;
        return parseTypeScript(file, source);
      }
    }
  );
  expect(parseCalls).toBe(2);
  expect(reads).toBe(2);
  expect(result.parsed).toBe(2);
  expect(seen[0]).toBeDefined();
  expect(seen[0]).toBe(seen[1]);
  expect(seen[2]).toBe(seen[3]);
  expect(seen[0]).not.toBe(seen[2]);
});

test("正規表現のルールは解析せず、include 関数と exclude が効く", () => {
  const rule: FileRule = {
    include: (file) => file.startsWith("app/"),
    exclude: /\.test\.ts$/,
    check: () => []
  };
  const result = runFileRules(
    ["app/a.ts", "app/a.test.ts", "b.ts"],
    [rule],
    () => "not valid TypeScript {{"
  );
  expect(result.readCount).toBe(1);
  expect(result.parsed).toBe(0);
});

test("対象 0 件のルールは optional でない限り失敗する", () => {
  const rule: FileRule = { include: /\.ts$/, check: () => [] };
  const result = runFileRules([], [rule], () => "", { names: ["lint:foo"] });
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.violation).toMatchObject({ rule: "lint:foo" });
  expect(JSON.stringify(result.findings[0]?.violation)).toContain("0 件");
  expect(runFileRules([], [{ ...rule, optional: true }], () => "").findings).toEqual([]);
});

test("g フラグ付きの include 正規表現でもファイルを取りこぼさない", () => {
  const result = runFileRules(["a.ts", "b.ts"], [{ include: /\.ts$/g, check: () => [] }], () => "");
  expect(result.readCount).toBe(2);
});

test("構文エラーは例外ではなく違反になる", () => {
  const plain: FileRule = { include: /\.ts$/, check: () => [{ plain: true }] };
  const result = runFileRules(
    ["a.ts"],
    [{ include: /\.ts$/, ast: true, check: () => [] }, plain],
    () => "const = ;",
    { names: ["lint:x", "lint:y"] }
  );
  expect(result.findings[0]).toMatchObject({
    rule: 0,
    violation: { rule: "lint:x", file: "a.ts", message: "解析失敗" }
  });
  expect(result.findings[1]).toEqual({ rule: 1, violation: { plain: true } });
});

test("check の違反はルールごとに集める", () => {
  const rule: FileRule = {
    include: /\.ts$/,
    ast: true,
    check: (file, _s, ast) => (ast?.program.body.length ? [{ file }] : [])
  };
  expect(runFileRules(["a.ts"], [rule], () => "const a = 1").findings).toEqual([
    { rule: 0, violation: { file: "a.ts" } }
  ]);
  expect(runFileRules(["a.ts"], [rule], () => "").findings).toEqual([]);
});

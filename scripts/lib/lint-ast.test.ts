import { expect, test } from "bun:test";
import { isTypeOnlyImport, lineOf, parseTypeScript, textOf } from "./lint-ast";

test("ESTree の位置情報は Unicode・コメント・括弧式を保つ", () => {
  const parsed = parseTypeScript("sample.ts", "// 日本語 🎨\nconst value = (a + b);");
  const declaration = parsed.program.body[0];
  expect(lineOf(parsed, declaration)).toBe(2);
  expect(textOf(parsed, declaration)).toBe("const value = (a + b);");
  if (declaration.type !== "VariableDeclaration") throw new Error("expected declaration");
  expect(declaration.declarations[0].init?.type).toBe("ParenthesizedExpression");
});

test("構文エラーはファイル名付きで例外になる", () => {
  expect(() => parseTypeScript("broken.ts", "const = ;")).toThrow("broken.ts");
});

test("isTypeOnlyImport は型 import と実行時・副作用 import を分ける", () => {
  const kinds = (source: string) => {
    const parsed = parseTypeScript("a.ts", source);
    const node = parsed.program.body[0];
    if (node.type !== "ImportDeclaration") throw new Error("expected import");
    return isTypeOnlyImport(node, parsed);
  };
  expect(kinds('import type { A } from "a";')).toBe(true);
  expect(kinds('import { type A, type B } from "a";')).toBe(true);
  expect(kinds('import {} from "a";')).toBe(true);
  expect(kinds('import { type A, b } from "a";')).toBe(false);
  expect(kinds('import "a";')).toBe(false);
  expect(kinds('import a from "a";')).toBe(false);
});

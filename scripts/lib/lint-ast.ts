import type { Node, Program } from "oxc-parser";
import { parseSync } from "oxc-parser";

export type { Node } from "oxc-parser";

export type ParsedSource = { fileName: string; source: string; program: Program };
export type AstNode<T extends Node["type"]> = Extract<Node, { type: T }>;

export function parseTypeScript(file: string, source: string): ParsedSource {
  const fileName = file.replaceAll("\\", "/");
  const result = parseSync(fileName, source, { preserveParens: true });
  if (result.errors.length)
    throw new Error(`${fileName}: ${result.errors.map((e) => e.message).join("; ")}`);
  return { fileName, source, program: result.program };
}
export function isNode<T extends Node["type"]>(node: unknown, type: T): node is AstNode<T> {
  return typeof node === "object" && node !== null && "type" in node && node.type === type;
}
export function children(node: Node): Node[] {
  const result: Node[] = [];
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && typeof child.type === "string")
        result.push(child as Node);
    }
  }
  return result;
}
export function forEachChild(node: Node | ParsedSource, visit: (node: Node) => void): void {
  for (const child of children("program" in node ? node.program : node)) visit(child);
}
export function lineOf(parsed: ParsedSource, node: Node): number {
  return parsed.source.slice(0, node.start).split("\n").length;
}
export function textOf(parsed: ParsedSource, node: Node): string {
  return parsed.source.slice(node.start, node.end);
}
export function stringValue(node: Node): string | null {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? null;
  return null;
}
export function isSideEffectImport(node: AstNode<"ImportDeclaration">, parsed: ParsedSource) {
  // ESTree は import {} と副作用 import のどちらも空の specifiers にするため、source の前だけを見る。
  const prefix = parsed.source
    .slice(node.start, node.source.start)
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
  return node.specifiers.length === 0 && /^import\s*$/.test(prefix);
}
export function isTypeOnlyImport(node: AstNode<"ImportDeclaration">, parsed: ParsedSource) {
  return (
    node.importKind === "type" ||
    (node.specifiers.length > 0 &&
      node.specifiers.every((s) => s.type === "ImportSpecifier" && s.importKind === "type")) ||
    // 空の named import は型のみ扱い。副作用 import だけが実行時の依存になる。
    (node.specifiers.length === 0 && !isSideEffectImport(node, parsed))
  );
}
/**
 * 実行時に読み込まれるモジュールの指定子を返す。
 * import / export ... from / import() / require() を対象にし、型だけの import / export は null にする。
 */
export function runtimeModuleSpecifier(node: Node, parsed: ParsedSource): string | null {
  let source: Node | null = null;
  if (isNode(node, "ImportDeclaration")) {
    if (isTypeOnlyImport(node, parsed)) return null;
    source = node.source;
  } else if (isNode(node, "ExportNamedDeclaration") || isNode(node, "ExportAllDeclaration")) {
    if (node.exportKind === "type") return null;
    source = node.source;
  } else if (isNode(node, "ImportExpression")) {
    source = node.source;
  } else if (
    isNode(node, "CallExpression") &&
    isNode(node.callee, "Identifier") &&
    node.callee.name === "require"
  ) {
    source = node.arguments[0] ?? null;
  }
  return source ? stringValue(source) : null;
}

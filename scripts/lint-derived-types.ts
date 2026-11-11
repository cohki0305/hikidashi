/**
 * 型は schema から導出する。リネームだけの `type A = B` と、
 * `…Request` / `…Response` / `…Body` / `…Dto` の手書きの型を検出する（`z.infer` で導出する）。
 * 外部サービスの応答の形など、こちらで schema を持てないものだけ、宣言の直前の行コメント
 * `// lint:allow-hand-written-dto: <理由>`（理由必須）で手書きを許す。リネームだけの型は例外にできない。
 */
import {
  forEachChild,
  isNode,
  lineOf,
  type Node,
  type ParsedSource,
  parseTypeScript
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

export type DerivedTypeViolation = {
  file: string;
  line: number;
  rule: "rename-only" | "hand-written-dto" | "missing-reason";
  name: string;
};

const TARGET_RE = /^(app|server|shared|scripts)\/.*\.tsx?$/;
const IGNORE_RE = /^app\/routeTree\.gen\.ts$/;
const DTO_NAME_RE = /(Request|Response|Body|Dto)$/;
const ALLOW_RE = /^[ \t]*\/\/[ \t]*lint:allow-hand-written-dto:(.*)$/;
const DERIVE_NAMES = new Set(["infer", "input", "output"]);

/** `z.infer<…>` `zod.input<…>` のような、schema から型を導出する書き方か。 */
function isDerivation(node: Node): boolean {
  if (!isNode(node, "TSTypeReference") || !isNode(node.typeName, "TSQualifiedName")) return false;
  const { left, right } = node.typeName;
  return isNode(left, "Identifier") && DERIVE_NAMES.has(right.name);
}

function isAliasOnly(node: Node): boolean {
  return (
    isNode(node, "TSTypeReference") &&
    !node.typeArguments &&
    (isNode(node.typeName, "Identifier") || isNode(node.typeName, "TSQualifiedName"))
  );
}

export function findDerivedTypeViolations(file: string, source: string): DerivedTypeViolation[] {
  const rel = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(rel) || IGNORE_RE.test(rel) || /\.test\.tsx?$/.test(rel)) return [];
  const parsed: ParsedSource = parseTypeScript(rel, source);
  const violations: DerivedTypeViolation[] = [];
  const add = (node: Node, rule: DerivedTypeViolation["rule"], name: string) =>
    violations.push({ file: rel, line: lineOf(parsed, node), rule, name });
  const lines = source.split("\n");
  /** 宣言の直前の行にある例外コメント。無ければ null、理由が空なら ""。 */
  const allowReasonOf = (node: Node): string | null => {
    const match = ALLOW_RE.exec(lines[lineOf(parsed, node) - 2] ?? "");
    return match ? (match[1] ?? "").trim() : null;
  };
  const addHandWritten = (node: Node, name: string) => {
    const reason = allowReasonOf(node);
    if (reason === null) add(node, "hand-written-dto", name);
    else if (reason === "") add(node, "missing-reason", name);
  };
  const visit = (node: Node): void => {
    if (isNode(node, "TSTypeAliasDeclaration")) {
      const name = node.id.name;
      if (isAliasOnly(node.typeAnnotation)) add(node, "rename-only", name);
      else if (DTO_NAME_RE.test(name) && !isDerivation(node.typeAnnotation))
        addHandWritten(node, name);
    } else if (isNode(node, "TSInterfaceDeclaration") && DTO_NAME_RE.test(node.id.name)) {
      addHandWritten(node, node.id.name);
    }
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: リネームだけの型は元の型をそのまま使う。Request / Response / Body / Dto は shared/schemas または server/schemas の schema から z.infer で導出する（外部サービスの応答の形だけ `// lint:allow-hand-written-dto: <理由>`）";
export const FILE_RULE: FileRule = {
  include: TARGET_RE,
  exclude: /\.test\.tsx?$/,
  ast: true,
  optional: true,
  check: (file, source) => findDerivedTypeViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:derived-types"]));

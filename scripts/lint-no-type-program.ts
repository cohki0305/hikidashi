/** 独自 lint で TypeScript の型情報（createProgram / getTypeChecker）を使わせない。 */
import { forEachChild, isNode, lineOf, type Node, parseTypeScript } from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

export type NoTypeProgramViolation = { file: string; line: number; name: string };

const FORBIDDEN = new Set(["createProgram", "getTypeChecker"]);
const TARGET_RE = /^scripts\/(lint-[^/]+|lib\/lint-[^/]+|lint\/[^/]+)\.tsx?$/;

export function findNoTypeProgramViolations(
  file: string,
  source: string
): NoTypeProgramViolation[] {
  const rel = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(rel) || /\.test\.tsx?$/.test(rel)) return [];
  const parsed = parseTypeScript(rel, source);
  const violations: NoTypeProgramViolation[] = [];
  const seen = new Set<number>();
  const visit = (node: Node): void => {
    // 省略記法（{ a }）は key と value が同じ位置の別ノードになるので、位置で 1 件にまとめる
    if (isNode(node, "Identifier") && FORBIDDEN.has(node.name) && !seen.has(node.start)) {
      seen.add(node.start);
      violations.push({ file: rel, line: lineOf(parsed, node), name: node.name });
    }
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: 型情報を使わず、scripts/lib/lint-ast.ts の AST（parseTypeScript など）と文字列だけで判定する";
export const FILE_RULE: FileRule = {
  include: TARGET_RE,
  exclude: /\.test\.tsx?$/,
  ast: true,
  optional: true,
  check: (file, source) => findNoTypeProgramViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:no-type-program"]));

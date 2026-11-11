import { forEachChild, isNode, lineOf, type Node, parseTypeScript } from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

const TARGET_RE = /^app\/routes\/.*\.tsx?$/;
const TEST_RE = /\.test\.tsx?$/;

export type RouteTypeCastViolation = { file: string; line: number };

export function findRouteTypeCastViolations(
  file: string,
  source: string
): RouteTypeCastViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(normalizedFile) || TEST_RE.test(normalizedFile)) return [];
  const parsed = parseTypeScript(normalizedFile, source);
  const violations: RouteTypeCastViolation[] = [];
  const names = new Set(["createFileRoute"]);
  const collect = (node: Node): void => {
    if (isNode(node, "ImportDeclaration"))
      for (const spec of node.specifiers)
        if (
          isNode(spec, "ImportSpecifier") &&
          isNode(spec.imported, "Identifier") &&
          spec.imported.name === "createFileRoute"
        )
          names.add(spec.local.name);
    forEachChild(node, collect);
  };
  forEachChild(parsed, collect);
  const unwrap = (node: Node): Node =>
    isNode(node, "ParenthesizedExpression") ? unwrap(node.expression) : node;
  const visit = (node: Node): void => {
    if (
      isNode(node, "CallExpression") &&
      isNode(unwrap(node.callee), "Identifier") &&
      names.has((unwrap(node.callee) as { name: string }).name) &&
      node.arguments.some((arg) => {
        const inner = unwrap(arg);
        return (
          isNode(inner, "TSAsExpression") ||
          isNode(inner, "TSSatisfiesExpression") ||
          isNode(inner, "TSTypeAssertion")
        );
      })
    )
      violations.push({ file: normalizedFile, line: lineOf(parsed, node) });
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: createFileRoute の引数を as で書き換えず、bun run build で app/routeTree.gen.ts を作り直す。";
export const FILE_RULE: FileRule = {
  include: TARGET_RE,
  exclude: TEST_RE,
  ast: true,
  check: findRouteTypeCastViolations
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:no-route-type-cast"]));

/** server と shared の実行時コードが Bun 専用の API（Bun.* と bun: import）を使わないことを強制する。 */
import {
  forEachChild,
  isNode,
  lineOf,
  type Node,
  type ParsedSource,
  parseTypeScript,
  runtimeModuleSpecifier,
  textOf
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

// 本番は Cloudflare Workers で、Bun のグローバルも bun: モジュールも無い。
const TARGET_RE = /^(server|shared)\//;
const TEST_RE = /\.test\.tsx?$/;

export type BunRuntimeViolation = { file: string; line: number; api: string };

function isBunGlobal(node: Node): boolean {
  if (isNode(node, "Identifier")) return node.name === "Bun";
  return (
    isNode(node, "MemberExpression") &&
    isNode(node.object, "Identifier") &&
    node.object.name === "globalThis" &&
    isNode(node.property, "Identifier") &&
    node.property.name === "Bun"
  );
}

function bunSpecifier(node: Node, parsed: ParsedSource): string | null {
  const value = runtimeModuleSpecifier(node, parsed);
  return value?.startsWith("bun:") || value === "bun" ? value : null;
}

export function findBunRuntimeViolations(file: string, source: string): BunRuntimeViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(normalizedFile) || TEST_RE.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: BunRuntimeViolation[] = [];
  function visit(node: Node): void {
    if (isNode(node, "MemberExpression") && isBunGlobal(node.object))
      violations.push({
        file: normalizedFile,
        line: lineOf(parsed, node),
        api: textOf(parsed, node)
      });
    const specifier = bunSpecifier(node, parsed);
    if (specifier !== null)
      violations.push({ file: normalizedFile, line: lineOf(parsed, node), api: specifier });
    forEachChild(node, visit);
  }
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: Workers でも動く API（Web 標準か nodejs_compat の範囲）に置き換える。Bun 専用の処理は scripts/ か tests/ に置く";
export const FILE_RULE: FileRule = {
  include: /^(server|shared)\/.*\.tsx?$/,
  exclude: TEST_RE,
  ast: true,
  check: findBunRuntimeViolations
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:no-bun-runtime"]));

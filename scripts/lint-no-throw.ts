/** Service / server lib の想定内失敗を例外ではなく Result で返すことを強制する。 */
import { forEachChild, isNode, lineOf, type Node, parseTypeScript } from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

export type NoThrowViolation = { file: string; line: number; message: string };

export function findNoThrowViolations(file: string, source: string): NoThrowViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!/^server\/(services|lib)\//.test(normalizedFile)) return [];
  if (/\.test\.tsx?$/.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: NoThrowViolation[] = [];
  function visit(node: Node): void {
    if (isNode(node, "ThrowStatement"))
      violations.push({
        file: normalizedFile,
        line: lineOf(parsed, node),
        message: "Service / lib では throw せず Result を返す"
      });
    forEachChild(node, visit);
  }
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX = "Fix: 想定内の失敗は kind と message を持つ Result の Err で返す";
export const FILE_RULE: FileRule = {
  include: /^server\/(services|lib)\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  check: (file, source) => findNoThrowViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:no-throw"]));

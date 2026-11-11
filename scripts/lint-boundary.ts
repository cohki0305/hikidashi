/** app から server への値 import（実行時の依存）を禁止する。型の import は許す。 */
import path from "node:path";
import {
  forEachChild,
  lineOf,
  type Node,
  parseTypeScript,
  runtimeModuleSpecifier
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

const TEST_RE = /\.test\.tsx?$/;

export type BoundaryViolation = { file: string; line: number; importedPath: string };

function isServerImport(file: string, importedPath: string): boolean {
  if (importedPath.startsWith("@/server/")) return true;
  if (importedPath === "server" || importedPath.startsWith("server/")) return true;
  if (!importedPath.startsWith(".")) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), importedPath));
  return resolved === "server" || resolved.startsWith("server/");
}

export function findBoundaryViolations(file: string, source: string): BoundaryViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!/^app\//.test(normalizedFile) || TEST_RE.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: BoundaryViolation[] = [];
  function visit(node: Node): void {
    const specifier = runtimeModuleSpecifier(node, parsed);
    if (specifier !== null && isServerImport(normalizedFile, specifier))
      violations.push({
        file: normalizedFile,
        line: lineOf(parsed, node),
        importedPath: specifier
      });
    forEachChild(node, visit);
  }
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: server は import type だけにし、実行時の呼び出しは hc<AppType> の API 経由にする";
export const FILE_RULE: FileRule = {
  include: /^app\/.*\.tsx?$/,
  exclude: TEST_RE,
  ast: true,
  optional: true,
  check: findBoundaryViolations
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:boundary"]));

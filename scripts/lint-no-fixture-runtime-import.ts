/** テスト以外のコードが tests/fixtures を import しないことを強制する。 */
import path from "node:path";
import {
  forEachChild,
  lineOf,
  type Node,
  parseTypeScript,
  runtimeModuleSpecifier
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

// テスト専用に切り離した fixture が runtime から import されると、その意味が失われる。
const TEST_RE = /\.test\.tsx?$/;

export type FixtureImportViolation = { file: string; line: number; importedPath: string };

function isFixtureImport(file: string, importedPath: string): boolean {
  if (importedPath === "@/tests/fixtures" || importedPath.startsWith("@/tests/fixtures/"))
    return true;
  if (!importedPath.startsWith(".")) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), importedPath));
  return resolved === "tests/fixtures" || resolved.startsWith("tests/fixtures/");
}

export function findFixtureImportViolations(
  file: string,
  source: string
): FixtureImportViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (TEST_RE.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: FixtureImportViolation[] = [];
  function visit(node: Node): void {
    const specifier = runtimeModuleSpecifier(node, parsed);
    if (specifier !== null && isFixtureImport(normalizedFile, specifier))
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
  "Fix: tests/fixtures/ はテスト専用。runtime が必要な事実はサーバーの読取 API から受ける";
export const FILE_RULE: FileRule = {
  include: /^(app|server|shared)\/.*\.tsx?$/,
  exclude: TEST_RE,
  ast: true,
  optional: true,
  check: findFixtureImportViolations
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) =>
    runLintCli(["lint:no-fixture-runtime-import"])
  );

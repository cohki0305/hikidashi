/** import の指定子を `@/` に一本化する。`../` と旧エイリアスを禁止する（同じフォルダの `./x` は許す）。 */
import {
  forEachChild,
  isNode,
  lineOf,
  type Node,
  parseTypeScript,
  stringValue
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

const LEGACY_ALIAS_RE = /^(~|@server|@shared|@test|@ext)\//;
const TARGET_RE = /^(app|server|shared|tests|scripts)\/.*\.tsx?$/;
const IGNORE_RE = /^(app\/routeTree\.gen\.ts|tests\/fixtures\/.*)$/;

export type ImportAliasViolation = {
  file: string;
  line: number;
  rule: "relative-parent" | "legacy-alias";
  importedPath: string;
  message: string;
};

function moduleSpecifier(node: Node): string | null {
  if (
    isNode(node, "ImportDeclaration") ||
    isNode(node, "ExportNamedDeclaration") ||
    isNode(node, "ExportAllDeclaration") ||
    isNode(node, "ImportExpression")
  )
    return node.source ? stringValue(node.source) : null;
  if (!isNode(node, "CallExpression")) return null;
  const callee = node.callee;
  const isRequire = isNode(callee, "Identifier") && callee.name === "require";
  const isMockModule =
    isNode(callee, "MemberExpression") &&
    isNode(callee.object, "Identifier") &&
    callee.object.name === "mock" &&
    isNode(callee.property, "Identifier") &&
    callee.property.name === "module";
  if (!isRequire && !isMockModule) return null;
  const first = node.arguments[0];
  return first ? stringValue(first) : null;
}

export function findImportAliasViolations(file: string, source: string): ImportAliasViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(normalizedFile) || IGNORE_RE.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: ImportAliasViolation[] = [];
  function visit(node: Node): void {
    const specifier = moduleSpecifier(node);
    if (specifier !== null) {
      const line = lineOf(parsed, node);
      if (specifier.split("/").includes(".."))
        violations.push({
          file: normalizedFile,
          line,
          rule: "relative-parent",
          importedPath: specifier,
          message: `../ は使えない。@/<リポジトリ直下からのパス> に書き換える: ${specifier}`
        });
      else if (LEGACY_ALIAS_RE.test(specifier))
        violations.push({
          file: normalizedFile,
          line,
          rule: "legacy-alias",
          importedPath: specifier,
          message: `旧エイリアスは使えない。@/<リポジトリ直下からのパス> に書き換える: ${specifier}`
        });
    }
    forEachChild(node, visit);
  }
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: import は @/server/...・@/app/... のように @/<リポジトリ直下からのパス> で書く。許すのは同じフォルダの ./x だけ";
export const FILE_RULE: FileRule = {
  include: TARGET_RE,
  exclude: IGNORE_RE,
  ast: true,
  check: findImportAliasViolations
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:import-alias"]));

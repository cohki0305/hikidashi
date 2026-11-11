/**
 * services / repositories の書き方を強制する。
 * (a) `{name}-service/index.ts` は `{Name}Service`、`{table}-repository/index.ts` は
 *     `{Table}Repository` の class を export する
 * (b) 依存はコンストラクタ引数で受け、モジュール直下で他層の class を new しない
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

export type LayerClassViolation = {
  file: string;
  line: number;
  rule: "layer-must-export-class" | "module-level-instance";
  expected: string;
};

const LAYER_RE = /^server\/(services|repositories)\/([^/]+)-(service|repository)\/(.+)$/;
const LAYER_NAME_RE = /(Service|Repository)$/;

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

function exportedNames(parsed: ParsedSource): Set<string> {
  const names = new Set<string>();
  for (const stmt of parsed.program.body) {
    if (!isNode(stmt, "ExportNamedDeclaration")) continue;
    const decl = stmt.declaration;
    if (decl?.type === "ClassDeclaration" && decl.id) names.add(decl.id.name);
    for (const spec of stmt.specifiers) {
      const exported = spec.exported;
      names.add(isNode(exported, "Identifier") ? exported.name : String(exported.value));
    }
  }
  return names;
}

/** import の別名を元の名前へ戻す（`import { A as B }` の B → A）。 */
function importedNames(parsed: ParsedSource): Map<string, string> {
  const map = new Map<string, string>();
  for (const stmt of parsed.program.body) {
    if (!isNode(stmt, "ImportDeclaration")) continue;
    for (const spec of stmt.specifiers) {
      if (!isNode(spec, "ImportSpecifier")) continue;
      const imported = spec.imported;
      map.set(
        spec.local.name,
        isNode(imported, "Identifier") ? imported.name : String(imported.value)
      );
    }
  }
  return map;
}

function calleeName(callee: Node, aliases: Map<string, string>): string | null {
  if (isNode(callee, "Identifier")) return aliases.get(callee.name) ?? callee.name;
  if (isNode(callee, "MemberExpression") && isNode(callee.property, "Identifier"))
    return callee.property.name;
  return null;
}

function moduleLevelInstances(parsed: ParsedSource, file: string): LayerClassViolation[] {
  const aliases = importedNames(parsed);
  const violations: LayerClassViolation[] = [];
  function visit(node: Node): void {
    // 関数・class の中は呼ばれるまで実行されないので、モジュール直下ではない。
    if (
      isNode(node, "FunctionDeclaration") ||
      isNode(node, "FunctionExpression") ||
      isNode(node, "ArrowFunctionExpression") ||
      isNode(node, "ClassBody")
    )
      return;
    if (isNode(node, "NewExpression")) {
      const name = calleeName(node.callee, aliases);
      if (name && LAYER_NAME_RE.test(name))
        violations.push({
          file,
          line: lineOf(parsed, node),
          rule: "module-level-instance",
          expected: name
        });
    }
    forEachChild(node, visit);
  }
  forEachChild(parsed, visit);
  return violations;
}

export function findLayerClassViolations(file: string, source: string): LayerClassViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  const match = LAYER_RE.exec(normalizedFile);
  if (!match || /\.test\.tsx?$/.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const violations: LayerClassViolation[] = [];
  if (match[4] === "index.ts") {
    const expected = `${pascal(match[2] ?? "")}${match[1] === "services" ? "Service" : "Repository"}`;
    if (!exportedNames(parsed).has(expected))
      violations.push({ file: normalizedFile, line: 1, rule: "layer-must-export-class", expected });
  }
  return [...violations, ...moduleLevelInstances(parsed, normalizedFile)];
}

export const RUNNER_FIX =
  "Fix: index.ts で {Name}Service / {Table}Repository の class を export し、依存はコンストラクタ引数で受ける（モジュール直下で new しない）";
export const FILE_RULE: FileRule = {
  include: /^server\/(services|repositories)\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  optional: true,
  check: (file, source) => findLayerClassViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:layer-class"]));

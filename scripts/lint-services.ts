/**
 * server/services を縛る。
 * (a) 1 ファイルを 300 行までにして、肥大化したサービスの分割を促す
 * (b) `{x}-service/index.ts` は `{X}Service` の class を export する
 */
import { isNode, type ParsedSource, parseTypeScript } from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

const MAX_LINES = 300;

export type ServiceSizeViolation = { file: string; lines: number; max: number };

export function countLines(source: string): number {
  const parts = source.split("\n");
  return source.endsWith("\n") ? parts.length - 1 : parts.length;
}

export function findServiceSizeViolations(file: string, source: string): ServiceSizeViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!normalizedFile.startsWith("server/services/") || /\.test\.tsx?$/.test(normalizedFile))
    return [];
  const lines = countLines(source);
  return lines > MAX_LINES ? [{ file: normalizedFile, lines, max: MAX_LINES }] : [];
}

export type ServiceClassViolation = {
  file: string;
  expected: string;
  rule: "service-class-not-exported";
};

const SERVICE_INDEX_RE = /^server\/services\/([^/]+)-service\/index\.ts$/;

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/** `export class X` と、トップレベルで宣言した class を `export { X }` `export { Y as X }` した名前。 */
function exportedClassNames(parsed: ParsedSource): Set<string> {
  const declared = new Set<string>();
  const exported = new Set<string>();
  for (const stmt of parsed.program.body) {
    if (stmt.type === "ClassDeclaration" && stmt.id) declared.add(stmt.id.name);
    if (!isNode(stmt, "ExportNamedDeclaration")) continue;
    const decl = stmt.declaration;
    if (decl?.type === "ClassDeclaration" && decl.id) {
      declared.add(decl.id.name);
      exported.add(decl.id.name);
    }
    if (stmt.source) continue;
    for (const spec of stmt.specifiers) {
      const local = isNode(spec.local, "Identifier") ? spec.local.name : String(spec.local.value);
      const name = isNode(spec.exported, "Identifier")
        ? spec.exported.name
        : String(spec.exported.value);
      if (declared.has(local)) exported.add(name);
    }
  }
  return exported;
}

export function findServiceClassViolations(file: string, source: string): ServiceClassViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  const match = SERVICE_INDEX_RE.exec(normalizedFile);
  if (!match) return [];
  const expected = `${pascal(match[1] ?? "")}Service`;
  const parsed = parseTypeScript(normalizedFile, source);
  return exportedClassNames(parsed).has(expected)
    ? []
    : [{ file: normalizedFile, expected, rule: "service-class-not-exported" }];
}

export const RUNNER_FIX =
  "Fix: 責務ごとにファイルを分けて、1 ファイルを 300 行までにする。{x}-service/index.ts は {X}Service の class を export する";
export const FILE_RULE: FileRule = {
  include: /^server\/services\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  optional: true,
  check: (file, source) => [
    ...findServiceSizeViolations(file, source),
    ...findServiceClassViolations(file, source)
  ]
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:services"]));

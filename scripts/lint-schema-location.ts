/**
 * Zod の schema の定義は shared/schemas/（画面と API で共有するものの正）と
 * server/schemas/（サーバーだけのもの）に限る。それ以外で z.object( などを書くと検出する。
 */
import {
  forEachChild,
  isNode,
  lineOf,
  type Node,
  type ParsedSource,
  parseTypeScript,
  stringValue
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

export type SchemaLocationViolation = { file: string; line: number; call: string };

const TARGET_RE = /^(server\/(lib|api|services|repositories|middleware)|app)\/.*\.tsx?$/;
const IGNORE_RE = /^app\/routeTree\.gen\.ts$/;
const ZOD_RE = /^zod(\/.*)?$/;
const CONSTRUCTORS = new Set([
  "object",
  "strictObject",
  "looseObject",
  "string",
  "number",
  "boolean",
  "bigint",
  "date",
  "symbol",
  "array",
  "tuple",
  "record",
  "map",
  "set",
  "enum",
  "nativeEnum",
  "union",
  "discriminatedUnion",
  "intersection",
  "literal",
  "lazy",
  "custom",
  "instanceof",
  "preprocess",
  "optional",
  "nullable",
  "nullish",
  "any",
  "unknown",
  "never",
  "null",
  "undefined",
  "void",
  "int",
  "uuid",
  "email",
  "url",
  "iso",
  "templateLiteral",
  "file",
  "json"
]);

/** zod から import した名前を、namespace 側（z・別名）と構築関数側に分けて集める。 */
function zodBindings(parsed: ParsedSource) {
  const namespaces = new Set<string>();
  const functions = new Map<string, string>();
  for (const stmt of parsed.program.body) {
    if (!isNode(stmt, "ImportDeclaration") || stmt.importKind === "type") continue;
    const from = stringValue(stmt.source);
    if (!from || !ZOD_RE.test(from)) continue;
    for (const spec of stmt.specifiers) {
      if (isNode(spec, "ImportNamespaceSpecifier") || isNode(spec, "ImportDefaultSpecifier")) {
        namespaces.add(spec.local.name);
      } else if (isNode(spec, "ImportSpecifier") && spec.importKind !== "type") {
        const imported = spec.imported;
        const name = isNode(imported, "Identifier") ? imported.name : String(imported.value);
        if (name === "z") namespaces.add(spec.local.name);
        else if (CONSTRUCTORS.has(name)) functions.set(spec.local.name, name);
      }
    }
  }
  return { namespaces, functions };
}

export function findSchemaLocationViolations(
  file: string,
  source: string
): SchemaLocationViolation[] {
  const rel = file.replaceAll("\\", "/");
  if (!TARGET_RE.test(rel) || IGNORE_RE.test(rel)) return [];
  const parsed = parseTypeScript(rel, source);
  const { namespaces, functions } = zodBindings(parsed);
  if (!namespaces.size && !functions.size) return [];
  const violations: SchemaLocationViolation[] = [];
  const visit = (node: Node): void => {
    if (isNode(node, "CallExpression")) {
      const callee = node.callee;
      if (
        isNode(callee, "MemberExpression") &&
        isNode(callee.object, "Identifier") &&
        namespaces.has(callee.object.name) &&
        isNode(callee.property, "Identifier") &&
        CONSTRUCTORS.has(callee.property.name)
      )
        violations.push({
          file: rel,
          line: lineOf(parsed, node),
          call: `${callee.object.name}.${callee.property.name}`
        });
      else if (isNode(callee, "Identifier") && functions.has(callee.name))
        violations.push({ file: rel, line: lineOf(parsed, node), call: callee.name });
    }
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return violations;
}

export const RUNNER_FIX =
  "Fix: Zod の schema は shared/schemas/（画面と共有）か server/schemas/（サーバーだけ）に定義し、ここでは import して使う（型は z.infer で導出する）";
export const FILE_RULE: FileRule = {
  include: TARGET_RE,
  exclude: /\.test\.tsx?$/,
  ast: true,
  check: (file, source) => findSchemaLocationViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:schema-location"]));

/** DB ハンドルの呼び出しを server/repositories と server/db に閉じ込める。 */
import path from "node:path";
import {
  type AstNode,
  forEachChild,
  isNode,
  lineOf,
  type Node,
  type ParsedSource,
  parseTypeScript,
  stringValue
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

const ALLOWED_RE = /^server\/(repositories|db)\//;
// D1 と drizzle のハンドルで呼ぶ操作（RepositoryDb・TransactionalDb と同じ語彙）。
// D1 は transaction の代わりに batch を使い、run・prepare もハンドルから呼ぶ。
const DB_QUERY_METHODS = new Set([
  "select",
  "insert",
  "update",
  "delete",
  "execute",
  "transaction",
  "batch",
  "run",
  "prepare"
]);
const DB_HANDLE_RE = /^(db|database|tx)$/i;

export type DbAccessViolation = { file: string; line: number; message: string };

/** ファイル内で DB ハンドルに付いた名前と、server/db から import した DB 生成関数 */
type DbContext = { names: Set<string>; factories: Set<string> };

function memberName(node: Node): string | null {
  if (isNode(node, "Identifier")) return node.name;
  if (isNode(node, "PrivateIdentifier")) return node.name;
  return stringValue(node);
}

function unwrap(node: Node): Node {
  let current = node;
  while (isNode(current, "ParenthesizedExpression") || isNode(current, "ChainExpression"))
    current = current.expression;
  return current;
}

function calleeMember(node: AstNode<"CallExpression">) {
  const callee = unwrap(node.callee);
  if (!isNode(callee, "MemberExpression")) return null;
  const method = memberName(callee.property);
  if (method === null || (callee.computed && !stringValue(callee.property))) return null;
  return { method, receiver: unwrap(callee.object) };
}

function isDbName(name: string, ctx: DbContext): boolean {
  return ctx.names.has(name) || DB_HANDLE_RE.test(name);
}

/** 任意の式が DB ハンドルを表すか。別名・分割代入・c.get("db")・DB 生成関数の戻り値まで見る。 */
function isDbExpr(node: Node, ctx: DbContext): boolean {
  const value = unwrap(node);
  if (isNode(value, "Identifier")) return isDbName(value.name, ctx);
  if (isNode(value, "MemberExpression")) {
    const name = memberName(value.property);
    return name !== null && isDbName(name, ctx);
  }
  if (isNode(value, "CallExpression")) {
    const callee = unwrap(value.callee);
    if (isNode(callee, "Identifier") && ctx.factories.has(callee.name)) return true;
    const key = value.arguments[0];
    if (isNode(callee, "MemberExpression") && memberName(callee.property) === "get" && key) {
      const got = stringValue(key);
      return got !== null && isDbName(got, ctx);
    }
  }
  return false;
}

/** `const client = c.var.db` のような代入・分割代入の別名を DB ハンドルの名前として集める。 */
function collectAliases(node: Node, ctx: DbContext): void {
  if (isNode(node, "VariableDeclarator")) {
    if (isNode(node.id, "ObjectPattern")) {
      for (const prop of node.id.properties) {
        if (!isNode(prop, "Property")) continue;
        const key = memberName(prop.key);
        if (key === null || !isDbName(key, ctx)) continue;
        const value = isNode(prop.value, "AssignmentPattern") ? prop.value.left : prop.value;
        if (isNode(value, "Identifier")) ctx.names.add(value.name);
      }
    } else if (node.init && isNode(node.id, "Identifier") && isDbExpr(node.init, ctx)) {
      ctx.names.add(node.id.name);
    }
  } else if (
    isNode(node, "AssignmentExpression") &&
    isNode(node.left, "Identifier") &&
    isDbExpr(node.right, ctx)
  ) {
    ctx.names.add(node.left.name);
  }
  forEachChild(node, (child) => collectAliases(child, ctx));
}

/** `@/server/db`・`server/db`・相対パスのいずれでも server/db を指すか */
function resolvesToServerDb(file: string, spec: string): boolean {
  if (spec === "@/server/db" || spec.startsWith("@/server/db/")) return true;
  if (spec === "server/db" || spec.startsWith("server/db/")) return true;
  if (!spec.startsWith(".")) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  return resolved === "server/db" || resolved.startsWith("server/db/");
}

function isValueSpecifier(declaration: Node, spec: Node): boolean {
  if (isNode(declaration, "ImportDeclaration") && declaration.importKind === "type") return false;
  return !(isNode(spec, "ImportSpecifier") && spec.importKind === "type");
}

function collectServerDbImports(
  parsed: ParsedSource,
  file: string,
  ctx: DbContext,
  violations: DbAccessViolation[]
): void {
  for (const st of parsed.program.body) {
    if (!isNode(st, "ImportDeclaration")) continue;
    const origin = stringValue(st.source);
    if (origin === null || !resolvesToServerDb(file, origin)) continue;
    let hasValue = false;
    for (const spec of st.specifiers) {
      if (!isValueSpecifier(st, spec)) continue;
      if (spec.local) ctx.factories.add(spec.local.name);
      hasValue = true;
    }
    if (hasValue)
      violations.push({
        file,
        line: lineOf(parsed, st),
        message: "DB クライアントの生成・取得は server/repositories と server/db に置く"
      });
  }
}

export function findDbAccessViolations(file: string, source: string): DbAccessViolation[] {
  const normalizedFile = file.replaceAll("\\", "/");
  if (!normalizedFile.startsWith("server/") || ALLOWED_RE.test(normalizedFile)) return [];
  if (/\.test\.tsx?$/.test(normalizedFile)) return [];

  const parsed = parseTypeScript(normalizedFile, source);
  const ctx: DbContext = { names: new Set(), factories: new Set() };
  const violations: DbAccessViolation[] = [];
  collectServerDbImports(parsed, normalizedFile, ctx, violations);
  collectAliases(parsed.program, ctx);

  function visit(node: Node): void {
    if (isNode(node, "CallExpression")) {
      const member = calleeMember(node);
      if (member && DB_QUERY_METHODS.has(member.method) && isDbExpr(member.receiver, ctx))
        violations.push({
          file: normalizedFile,
          line: lineOf(parsed, node),
          message: "DB ハンドルの呼び出しは server/repositories と server/db に置く"
        });
    }
    forEachChild(node, visit);
  }
  visit(parsed.program);
  return violations;
}

export const RUNNER_FIX =
  "Fix: DB の読み書きは server/repositories/{table}-repository/ に移し、services から呼ぶ";
export const FILE_RULE: FileRule = {
  include: /^server\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  check: (file, source) => findDbAccessViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:db-access"]));

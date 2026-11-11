#!/usr/bin/env bun
/**
 * server/api/ の REST 規約を静的に強制する。
 *
 * (a) ルートパスの動詞禁止（`-` で区切った各語も見る。同一ファイル内の const 文字列のパスも解決する）
 * (b) server/api 全体で try 文禁止
 */
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

const FIX_VERB = "Fix: 状態遷移はサブリソースの create で表す（例: POST /skills/:name/versions）";
const FIX_TRY_CATCH = "Fix: エラー→HTTP status の変換はサブアプリの onError に集約する";

/** 名詞形は動詞ではないので入れない */
export const VERB_SEGMENTS = new Set([
  "confirm",
  "cancel",
  "create",
  "delete",
  "update",
  "remove",
  "add",
  "approve",
  "reject",
  "start",
  "stop",
  "join",
  "leave",
  "move",
  "send",
  "receive",
  "run",
  "execute",
  "reset",
  "apply",
  "resend"
]);

/** 名詞として許す語。動詞辞書に将来足されても URL の名詞を動詞と誤判定しない（00-roadmap の URL が使う） */
const NOUN_SEGMENTS = new Set(["settings", "status", "versions", "files", "uploads", "downloads"]);

/** 既存違反の一時免除（増やすときは理由コメント必須） */
export const ALLOWLIST = new Set<string>([]);

export type RouteRestViolation = {
  path: string;
  line: number;
  message: string;
  rule: "verb-in-route-path" | "try-catch-in-handler";
};

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "on"]);

/** トップレベルの `const NAME = "..."` を引く */
function resolveConstString(name: string, parsed: ParsedSource): string | null {
  for (const st of parsed.program.body) {
    const decl =
      isNode(st, "ExportNamedDeclaration") && st.declaration ? st.declaration : (st as Node);
    if (!isNode(decl, "VariableDeclaration")) continue;
    for (const d of decl.declarations) {
      if (isNode(d.id, "Identifier") && d.id.name === name && d.init) return stringValue(d.init);
    }
  }
  return null;
}

function routePathOf(call: AstNode<"CallExpression">, parsed: ParsedSource): string | null {
  // `.on("GET", "/x", …)` はパスが 2 番目
  const isOn =
    isNode(call.callee, "MemberExpression") &&
    isNode(call.callee.property, "Identifier") &&
    call.callee.property.name === "on";
  const first = call.arguments[isOn ? 1 : 0];
  if (!first) return null;
  const text = isNode(first, "Identifier")
    ? resolveConstString(first.name, parsed)
    : stringValue(first);
  return text?.startsWith("/") ? text : null;
}

export function findVerbInRoutePathViolations(
  file: string,
  source: string,
  parsed?: ParsedSource,
  options?: { verbs?: Set<string> }
): RouteRestViolation[] {
  const normalizedFile = toPosix(file);
  const sf = parsed ?? parseTypeScript(normalizedFile, source);
  const verbs = options?.verbs ?? VERB_SEGMENTS;
  const violations: RouteRestViolation[] = [];
  const visit = (node: Node): void => {
    if (
      isNode(node, "CallExpression") &&
      isNode(node.callee, "MemberExpression") &&
      !node.callee.computed &&
      isNode(node.callee.property, "Identifier") &&
      ROUTE_METHODS.has(node.callee.property.name)
    ) {
      const routePath = routePathOf(node, sf);
      for (const segment of routePath?.split("/") ?? []) {
        if (!segment || segment.startsWith(":")) continue;
        for (const word of segment.split("-")) {
          if (NOUN_SEGMENTS.has(word)) continue;
          if (!verbs.has(word)) continue;
          violations.push({
            path: normalizedFile,
            line: lineOf(sf, node),
            message: `ルートパスに動詞 "${word}" がある`,
            rule: "verb-in-route-path"
          });
        }
      }
    }
    forEachChild(node, visit);
  };
  visit(sf.program);
  return violations;
}

export function findTryCatchInHandlerViolations(
  file: string,
  source: string,
  parsed?: ParsedSource
): RouteRestViolation[] {
  const normalizedFile = toPosix(file);
  const sf = parsed ?? parseTypeScript(normalizedFile, source);
  const violations: RouteRestViolation[] = [];
  const visit = (node: Node): void => {
    if (isNode(node, "TryStatement"))
      violations.push({
        path: normalizedFile,
        line: lineOf(sf, node),
        message: "route handler で try/catch しない",
        rule: "try-catch-in-handler"
      });
    forEachChild(node, visit);
  };
  visit(sf.program);
  return violations;
}

export function findRouteRestViolations(
  file: string,
  source: string,
  options?: { allowlist?: Set<string> },
  parsed?: ParsedSource
): RouteRestViolation[] {
  const allowlist = options?.allowlist ?? ALLOWLIST;
  const normalizedFile = toPosix(file);
  if (allowlist.has(normalizedFile)) return [];
  if (!normalizedFile.startsWith("server/api/")) return [];
  if (/\.test\.tsx?$/.test(normalizedFile)) return [];

  const sf = parsed ?? parseTypeScript(normalizedFile, source);
  return [
    ...findVerbInRoutePathViolations(normalizedFile, source, sf),
    ...findTryCatchInHandlerViolations(normalizedFile, source, sf)
  ];
}

function toPosix(filePath: string): string {
  return filePath.split("\\").join("/");
}

export const RUNNER_FIX = [FIX_VERB, FIX_TRY_CATCH].join("\n");
export const FILE_RULE: FileRule = {
  include: /^server\/api\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  optional: true,
  check: (file, source, ast) => findRouteRestViolations(file, source, undefined, ast)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:route-rest"]));

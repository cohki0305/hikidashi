#!/usr/bin/env bun
/**
 * API 境界の契約を静的に強制する。
 *
 * zValidator に渡す schema は shared/schemas/{domain}/request/ から import し、名前が役割を表す
 *     （param → …ParamsSchema、query → …QuerySchema、json → 動詞始まり: createSkillSchema）
 */
import {
  type AstNode,
  forEachChild,
  isNode,
  lineOf,
  type Node,
  type ParsedSource,
  parseTypeScript,
  textOf
} from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

/** request body の schema 名に許す動詞（増やすときは理由を添える） */
export const REQUEST_VERBS = new Set([
  "create",
  "update",
  "delete",
  "remove",
  "add",
  "join",
  "leave",
  "send",
  "start",
  "stop",
  "cancel",
  "shuffle",
  "assign",
  "move",
  "set",
  "change",
  "invite",
  "kick",
  "grant",
  "revoke",
  "open",
  "close"
]);

const VALIDATOR = "zValidator";
const VALIDATOR_ORIGIN = "@hono/zod-validator";
const REQUEST_ORIGIN_RE = /^@\/shared\/schemas\/[^/]+\/request\//;
const startsWithRequestVerb = (name: string) => REQUEST_VERBS.has(name.match(/^[a-z]+/)?.[0] ?? "");
const VALIDATOR_TARGET_RULES: Record<string, (name: string) => boolean> = {
  param: (name) => /ParamsSchema$/.test(name),
  query: (name) => /QuerySchema$/.test(name),
  json: startsWithRequestVerb,
  form: startsWithRequestVerb,
  header: (name) => /HeadersSchema$/.test(name),
  cookie: (name) => /CookiesSchema$/.test(name)
};

export type ApiContractViolation = {
  path: string;
  line: number;
  message: string;
  rule: "request-role";
};

export function findApiContractViolations(
  file: string,
  source: string,
  parsed?: ParsedSource
): ApiContractViolation[] {
  const normalizedFile = file.split("\\").join("/");
  if (!normalizedFile.startsWith("server/api/") || /\.test\.tsx?$/.test(normalizedFile)) return [];
  const sf = parsed ?? parseTypeScript(normalizedFile, source);
  const violations: ApiContractViolation[] = [];

  // ローカル名 → { import 元, export 名 }。別名 import は export 名で役割を判定する
  const imports = new Map<string, { origin: string; imported: string }>();
  for (const st of sf.program.body) {
    if (st.type !== "ImportDeclaration") continue;
    for (const spec of st.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      const imported = isNode(spec.imported, "Identifier")
        ? spec.imported.name
        : String((spec.imported as { value?: unknown }).value);
      imports.set(spec.local.name, { origin: st.source.value, imported });
    }
  }

  // zValidator のローカル名。@hono/zod-validator からの別名 import と、zValidator を再公開した import も拾う
  const validatorNames = new Set([VALIDATOR]);
  for (const [local, info] of imports)
    if (info.origin === VALIDATOR_ORIGIN || info.imported === VALIDATOR) validatorNames.add(local);

  const visit = (node: Node) => {
    if (
      isNode(node, "CallExpression") &&
      isNode(node.callee, "Identifier") &&
      validatorNames.has(node.callee.name) &&
      node.arguments.length >= 2 &&
      isNode(node.arguments[0], "Literal") &&
      typeof node.arguments[0].value === "string"
    ) {
      const target = node.arguments[0].value;
      const accepts = VALIDATOR_TARGET_RULES[target];
      const arg = node.arguments[1];
      const info = isNode(arg, "Identifier") ? imports.get(arg.name) : undefined;
      // どの target でも import 元は request 層に限る。名前の規則は既知の target にだけ適用する。
      const nameValid = accepts === undefined || (info !== undefined && accepts(info.imported));
      const originValid = info !== undefined && REQUEST_ORIGIN_RE.test(info.origin);
      if (!nameValid || !originValid) {
        violations.push({
          path: normalizedFile,
          line: lineOf(sf, node),
          message: `zValidator("${target}") の schema が request 層の役割名でない: ${textOf(sf, arg).slice(0, 40)}`,
          rule: "request-role"
        });
      }
    }
    forEachChild(node, visit);
  };
  visit(sf.program as unknown as AstNode<"Program">);
  return violations;
}

export const RUNNER_FIX =
  'Fix: zValidator("param") は …IdParamsSchema、("query") は …QuerySchema、("json") は動詞始まり（createSkillSchema）の schema を @/shared/schemas/{domain}/request/ から import する。インライン z.object は使わない';
export const FILE_RULE: FileRule = {
  include: /^server\/api\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  ast: true,
  check: (file, source, ast) => findApiContractViolations(file, source, ast)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:api-contract"]));

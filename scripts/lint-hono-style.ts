/**
 * server/api の Hono の書き方を静的に強制する。
 *
 * (a) ルートハンドラを名前付き関数に分離しない（RPC の型推論が壊れる）
 * (b) Env 型付きの `new Hono<Env>()` は使わず createFactory で共有する
 * (c) 合成の index.ts（handlers/ 以外の全 index.ts）にはルートを書かず .route() だけにする
 * (d) リソースディレクトリ（server/api/protected/{domain}/）では、ルートは routes.ts の対応表にだけ書き、
 *     ハンドラは handlers/ から `...spread` する（1 行 1 エンドポイント、ハンドラを直書きしない）
 * (e) パス引数は c.req.param() / pathParam() で読まず zValidator("param") で受ける
 * (f) handlers/ では c.json() / c.body() を直接呼ばず @/server/lib/http の語彙を使う
 * (g) handlers/ の export 名は action 名（index / show / create / update / destroy）に閉じる。
 *     状態遷移はサブリソースの create として別ディレクトリに切る
 * (h) `.on(` は使わない（メソッドとパスが表の検査をすり抜ける）
 * (i) ルート定義は server/api の中だけ。server/app.ts など外では `.route()` のマウントだけにする
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

const FIX_EXTRACTED =
  "Fix: ハンドラは .get('/', async (c) => ...) のようにチェーンへ直接書く。分離が必要なら factory.createHandlers() を使う";
const FIX_TYPED_HONO = "Fix: const factory = createFactory<Env>(); factory.createApp().get(...)";
const FIX_INDEX =
  "Fix: HTTP メソッドは routes.ts へ移し、合成の index.ts は middleware / onError / .route() だけにする";
const FIX_TABLE =
  "Fix: ルートは routes.ts に `.get('/skills', ...skills.index)` の形で書き、ハンドラは handlers/{sub}/index.ts に factory.createHandlers() で置く";
const FIX_PARAM =
  "Fix: zValidator('param', xxxIdParamsSchema) を挟み、c.req.valid('param') で受ける";
const FIX_ON =
  "Fix: .on('GET', '/', ...) ではなく .get('/', ...) のようにメソッド名のチェーンで書く";
const FIX_OUTSIDE_API =
  "Fix: ルートは server/api/protected/{domain}/routes.ts に書き、server/app.ts では app.route(...) でマウントするだけにする";
const FIX_RESPONSE = "Fix: @/server/lib/http の ok / created / accepted / failure を使う";
const FIX_ACTION =
  "Fix: 状態遷移は handlers/{resource}-{transition}s/index.ts の create にする（例: skill-versions）";
const FIX_ACTION_METHOD =
  "Fix: GET 一覧は index、GET :id は show、POST は create、PUT/PATCH は update、DELETE は destroy に合わせる";
const FIX_HANDLER_DIR =
  "Fix: パスから導出した handlers/{dir}/ へ import * as ... する（例: POST /skills/:name/versions → skill-versions）";
const FIX_INFLECTION =
  "Fix: scripts/lint-hono-style.ts の SINGULAR_TO_PLURAL に単数/複数形を追加する";
const FIX_STATIC_ROUTE_PATH =
  "Fix: routes.ts のパスは '/skills' のように文字列リテラルで書く（定数・式は action / handler-dir の機械検査をすり抜ける）";

const ACTIONS = new Set(["index", "show", "create", "update", "destroy"]);

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "options"]);

/**
 * 単数形 → 複数形の既知語。規則で解決できない語は unknown-inflection に回すので、
 * 新しい語はここに足す（逆引きは PLURAL_TO_SINGULAR が導く）
 */
const SINGULAR_TO_PLURAL: Record<string, string> = {
  // スキルそのもの（/skills）
  skill: "skills",
  // スキルの版（/skills/:name/versions）
  version: "versions",
  // 版に含まれるファイル（/skills/:name/files）
  file: "files",
  // 公開途中の受け皿（/uploads）
  upload: "uploads",
  // zip のダウンロード（/skills/:name/versions/:version/download）
  download: "downloads"
};
const PLURAL_TO_SINGULAR: Record<string, string> = Object.fromEntries(
  Object.entries(SINGULAR_TO_PLURAL).map(([singular, plural]) => [plural, singular])
);

/** 既存違反の一時免除（増やすときは理由コメント必須） */
export const ALLOWLIST = new Set<string>([]);

export type HonoStyleViolation = {
  path: string;
  line: number;
  message: string;
  rule:
    | "extracted-handler"
    | "typed-hono-constructor"
    | "routes-in-index"
    | "inline-handler"
    | "routes-outside-table"
    | "raw-param"
    | "raw-response"
    | "unknown-action"
    | "action-method-mismatch"
    | "handler-dir-mismatch"
    | "unknown-inflection"
    | "static-route-path"
    | "on-method"
    | "routes-outside-api";
};

/** 合成の index.ts（server/api 配下の index.ts）。handlers/ 配下の index.ts は含まない */
function isCompositionIndex(file: string): boolean {
  return /^server\/api\/(?:.*\/)?index\.ts$/.test(file) && !isHandlersFile(file);
}

/** server/api/protected/{domain}/ 配下か（1 ファイルで収まるリソースは対象外）。 */
function isInResourceDir(file: string): boolean {
  return /^server\/api\/protected\/[^/]+\//.test(file);
}

function isRoutesTable(file: string): boolean {
  return /(^|\/)routes\.ts$/.test(file);
}

function isHandlersFile(file: string): boolean {
  return /\/handlers\//.test(file);
}

function isFunctionLike(
  node: Node
): node is AstNode<"ArrowFunctionExpression"> | AstNode<"FunctionExpression"> {
  return isNode(node, "ArrowFunctionExpression") || isNode(node, "FunctionExpression");
}

function propertyName(node: Node): string | null {
  if (isNode(node, "Identifier")) return node.name;
  if (isNode(node, "Literal") && typeof node.value === "string") return node.value;
  return null;
}

/** `x.req.param(...)` */
function isReqParamCall(node: AstNode<"CallExpression">): boolean {
  const callee = node.callee;
  return (
    isNode(callee, "MemberExpression") &&
    !callee.computed &&
    propertyName(callee.property) === "param" &&
    isNode(callee.object, "MemberExpression") &&
    !callee.object.computed &&
    propertyName(callee.object.property) === "req"
  );
}

/** `pathParam(c, "id")`（c.req.param の薄い包み。raw-param と同じ扱い） */
function isPathParamCall(node: AstNode<"CallExpression">): boolean {
  return isNode(node.callee, "Identifier") && node.callee.name === "pathParam";
}

const RAW_RESPONSE_METHODS = new Set(["json", "body", "text", "html", "redirect"]);

/** createHandlers コールバックの context 引数に対する生レスポンス API。fetch の `response.json()` は対象外 */
function isRawResponseCall(
  node: AstNode<"CallExpression">,
  contextNames: ReadonlySet<string>
): boolean {
  const callee = node.callee;
  return (
    isNode(callee, "MemberExpression") &&
    !callee.computed &&
    isNode(callee.object, "Identifier") &&
    contextNames.has(callee.object.name) &&
    RAW_RESPONSE_METHODS.has(propertyName(callee.property) ?? "")
  );
}

function extractContextParamName(
  fn: AstNode<"ArrowFunctionExpression"> | AstNode<"FunctionExpression">
): string | null {
  let firstParam: Node | undefined = fn.params[0];
  if (firstParam?.type === "AssignmentPattern") firstParam = firstParam.left;
  if (firstParam?.type === "RestElement") firstParam = firstParam.argument;
  return firstParam?.type === "Identifier" ? firstParam.name : null;
}

function isCreateHandlersCall(node: AstNode<"CallExpression">): boolean {
  const callee = node.callee;
  return (
    isNode(callee, "MemberExpression") &&
    !callee.computed &&
    propertyName(callee.property) === "createHandlers"
  );
}

function collectCreateHandlersContextNames(node: AstNode<"CallExpression">): Set<string> {
  const names = new Set<string>();
  for (const arg of node.arguments) {
    if (!isFunctionLike(arg)) continue;
    const name = extractContextParamName(arg);
    if (name) names.add(name);
  }
  return names;
}

function isRawResponseConstructor(node: AstNode<"NewExpression">): boolean {
  return isNode(node.callee, "Identifier") && node.callee.name === "Response";
}

type HandlerSpread = {
  namespace: string;
  action: string;
};

type PathSegment =
  | { kind: "static"; value: string }
  | { kind: "param"; value: string }
  | { kind: "unsupported"; raw: string };

function parseHandlerNamespaceImports(sourceFile: ParsedSource): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of sourceFile.program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const match = statement.source.value.match(/(?:^|\/)handlers\/([^/]+)$/);
    if (!match) continue;
    for (const spec of statement.specifiers)
      if (spec.type === "ImportNamespaceSpecifier") imports.set(spec.local.name, match[1]);
  }
  return imports;
}

function parseRoutePath(pathArg: Node): PathSegment[] | null {
  const pathText = stringValue(pathArg);
  if (pathText === null) return null;
  const segments: PathSegment[] = [];
  for (const part of pathText.split("/")) {
    if (part === "") continue;
    if (part.startsWith(":")) {
      if (part.includes("{") || part.includes("*")) {
        segments.push({ kind: "unsupported", raw: part });
      } else {
        segments.push({ kind: "param", value: part.slice(1) });
      }
    } else if (part.includes("*")) {
      segments.push({ kind: "unsupported", raw: part });
    } else {
      segments.push({ kind: "static", value: part });
    }
  }
  return segments;
}

/** 複数形にする。すでに複数形の語はそのまま返す。確信できない語（s で終わらず辞書にもない）は null */
function pluralizeWord(word: string): string | null {
  if (Object.hasOwn(PLURAL_TO_SINGULAR, word)) return word;
  if (Object.hasOwn(SINGULAR_TO_PLURAL, word)) return SINGULAR_TO_PLURAL[word];
  if (word.endsWith("s") && !word.endsWith("ss")) return word;
  return null;
}

/** 単数形にする。すでに単数形の語はそのまま返す。確信できない語（s で終わらず辞書にもない）は null */
function singularizeWord(word: string): string | null {
  if (Object.hasOwn(SINGULAR_TO_PLURAL, word)) return word;
  if (Object.hasOwn(PLURAL_TO_SINGULAR, word)) return PLURAL_TO_SINGULAR[word];
  if (word.endsWith("ies") && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 1 && !word.endsWith("ss")) return word.slice(0, -1);
  return null;
}

/** ハイフン区切りの最後の語だけを変換する */
function inflectSegment(segment: string, inflect: (word: string) => string | null): string | null {
  const parts = segment.split("-");
  const converted = inflect(parts[parts.length - 1]);
  if (!converted) return null;
  parts[parts.length - 1] = converted;
  return parts.join("-");
}

function expectedActionForRoute(method: string, segments: PathSegment[]): string | null {
  if (segments.some((segment) => segment.kind === "unsupported")) return null;
  if (method === "get") {
    const last = segments[segments.length - 1];
    if (!last) return null;
    return last.kind === "param" ? "show" : "index";
  }
  if (method === "post") return "create";
  if (method === "put" || method === "patch") return "update";
  if (method === "delete") return "destroy";
  return null;
}

function expectedHandlerDirForRoute(segments: PathSegment[]): string | null | "unknown-inflection" {
  const staticSegments = segments
    .filter((segment): segment is { kind: "static"; value: string } => segment.kind === "static")
    .map((segment) => segment.value);
  if (staticSegments.length === 0) return null;
  if (segments.some((segment) => segment.kind === "unsupported")) return null;

  if (staticSegments.length === 1) return staticSegments[0];

  const resource = staticSegments[staticSegments.length - 1];
  const singularParents = staticSegments
    .slice(0, -1)
    .map((segment) => inflectSegment(segment, singularizeWord));
  const pluralResource = inflectSegment(resource, pluralizeWord);
  if (singularParents.some((segment) => !segment) || !pluralResource) return "unknown-inflection";
  return `${singularParents.join("-")}-${pluralResource}`;
}

function parseHandlerSpread(node: Node): HandlerSpread | null {
  if (
    node.type !== "SpreadElement" ||
    node.argument.type !== "MemberExpression" ||
    node.argument.computed
  )
    return null;
  const property = node.argument;
  if (property.object.type !== "Identifier" || property.property.type !== "Identifier") return null;
  return { namespace: property.object.name, action: property.property.name };
}

function formatRoutePath(segments: PathSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "static") return segment.value;
      if (segment.kind === "param") return `:${segment.value}`;
      return segment.raw;
    })
    .join("/");
}

/** `...factory.createHandlers(...)` のように、対応表の中でハンドラを組み立てている */
function isInlineSpread(node: Node): boolean {
  return isNode(node, "SpreadElement") && isNode(node.argument, "CallExpression");
}

/** `.get("/x", ...)` の形のルート定義。`map.get(key)` のような 1 引数の取得は含めない */
function isRouteDefinition(node: AstNode<"CallExpression">, method: string): boolean {
  if (!HTTP_METHODS.has(method) || node.arguments.length === 0) return false;
  const first = node.arguments[0];
  return node.arguments.length >= 2 || (stringValue(first)?.startsWith("/") ?? false);
}

/** server/api の外で、パスの文字列かハンドラの関数・spread を渡している。`repo.delete(a, b)` のような普通のメソッド呼び出しは含めない */
function isMountedHandlerCall(node: AstNode<"CallExpression">): boolean {
  const last = node.arguments[node.arguments.length - 1];
  return (
    (stringValue(node.arguments[0])?.startsWith("/") ?? false) ||
    (!!last && (isFunctionLike(last) || isNode(last, "SpreadElement")))
  );
}

/**
 * `.on("GET", "/x", ...)` / `.on(["GET"], PATH, ...)` / `.on(method, "/x", ...)` / `.on(m, P, async (c) => ...)`。
 * メソッドかパスがリテラル、または最後がハンドラ（関数・spread）なら 3 引数以上の `.on(` をルート定義とみなす。
 * `emitter.on("event", fn)` や drizzle の `.on(t.a, t.b, t.c)` は含めない
 */
function isOnRoute(node: AstNode<"CallExpression">): boolean {
  const [methods, path] = node.arguments;
  if (!methods || !path || node.arguments.length < 3) return false;
  const last = node.arguments[node.arguments.length - 1];
  const methodText = stringValue(methods);
  const literalMethod =
    isNode(methods, "ArrayExpression") || (methodText !== null && /^[A-Za-z]+$/.test(methodText));
  const literalPath =
    isNode(path, "ArrayExpression") || (stringValue(path)?.startsWith("/") ?? false);
  return literalMethod || literalPath || isFunctionLike(last) || isNode(last, "SpreadElement");
}

function isHonoIdentifier(expression: Node): boolean {
  return isNode(expression, "Identifier") && expression.name === "Hono";
}

/** `export const` / `export function` / `export class` と `export { x as y }` の export 名 */
function exportedNames(node: AstNode<"ExportNamedDeclaration">): { name: string; at: Node }[] {
  const result: { name: string; at: Node }[] = [];
  const decl = node.declaration;
  if (isNode(decl, "VariableDeclaration")) {
    for (const d of decl.declarations)
      if (isNode(d.id, "Identifier")) result.push({ name: d.id.name, at: d });
  } else if (
    (decl?.type === "FunctionDeclaration" || decl?.type === "ClassDeclaration") &&
    decl.id
  ) {
    result.push({ name: decl.id.name, at: decl });
  }
  for (const spec of node.specifiers) {
    if (node.exportKind === "type" || spec.exportKind === "type") continue;
    const exported = spec.exported as { name?: string; value?: unknown };
    result.push({
      name: typeof exported.name === "string" ? exported.name : String(exported.value),
      at: spec
    });
  }
  return result;
}

function toPosix(filePath: string): string {
  return filePath.split("\\").join("/");
}

export function findHonoStyleViolations(
  file: string,
  source: string,
  options?: { allowlist?: Set<string> }
): HonoStyleViolation[] {
  const allowlist = options?.allowlist ?? ALLOWLIST;
  const normalizedFile = toPosix(file);
  if (allowlist.has(normalizedFile)) return [];
  if (!normalizedFile.startsWith("server/")) return [];
  if (/\.test\.tsx?$/.test(normalizedFile)) return [];
  const inApi = normalizedFile.startsWith("server/api/");

  const sourceFile = parseTypeScript(normalizedFile, source);
  const violations: HonoStyleViolation[] = [];
  const handlerNamespaceImports = parseHandlerNamespaceImports(sourceFile);
  const inHandlers = isHandlersFile(normalizedFile);
  let activeHandlerContextNames = new Set<string>();

  const report = (node: Node, rule: HonoStyleViolation["rule"], message: string) => {
    violations.push({ path: normalizedFile, line: lineOf(sourceFile, node), message, rule });
  };

  /** routes.ts の 1 行 1 エンドポイント: ハンドラの spread・action・handler ディレクトリを検査する */
  const checkTableRoute = (node: AstNode<"CallExpression">, method: string) => {
    const last = node.arguments[node.arguments.length - 1];
    const inlineMessage = "routes.ts にハンドラを直書きしない（handlers/ から ...spread する）";
    if (!last || isFunctionLike(last) || isInlineSpread(last)) {
      report(node, "inline-handler", inlineMessage);
      return;
    }
    const handlerSpread = parseHandlerSpread(last);
    if (!handlerSpread || !handlerNamespaceImports.has(handlerSpread.namespace)) {
      report(node, "inline-handler", inlineMessage);
      return;
    }
    if (node.arguments.length < 2) return;

    const pathArg = node.arguments[0];
    const segments = parseRoutePath(pathArg);
    if (!segments) {
      report(
        node,
        "static-route-path",
        "routes.ts のパス引数は文字列リテラル（置換のないテンプレートリテラルを含む）で書く"
      );
      return;
    }
    if (segments.some((segment) => segment.kind === "unsupported")) {
      report(
        node,
        "action-method-mismatch",
        `規約外のパスセグメント: ${formatRoutePath(segments)}`
      );
      return;
    }

    const routePath = formatRoutePath(segments);
    const expectedAction = expectedActionForRoute(method, segments);
    if (expectedAction && handlerSpread.action !== expectedAction) {
      report(
        node,
        "action-method-mismatch",
        `${method.toUpperCase()} /${routePath} に対応する action は ${expectedAction}（実際: ${handlerSpread.action}）`
      );
    }

    const expectedDir = expectedHandlerDirForRoute(segments);
    if (expectedDir === "unknown-inflection") {
      report(
        node,
        "unknown-inflection",
        `/${routePath} の handler ディレクトリ名を単数/複数形辞書で導出できない（SINGULAR_TO_PLURAL に語を足す）`
      );
    } else if (expectedDir) {
      const actualDir = handlerNamespaceImports.get(handlerSpread.namespace);
      if (actualDir && actualDir !== expectedDir) {
        report(
          node,
          "handler-dir-mismatch",
          `${method.toUpperCase()} /${routePath} に対応する handler ディレクトリは ${expectedDir}（実際: ${actualDir}）`
        );
      }
    }
  };

  const checkRouteCall = (node: AstNode<"CallExpression">, method: string) => {
    if (isCompositionIndex(normalizedFile)) {
      report(node, "routes-in-index", "index.ts にルートを書かない（合成だけ）");
    }

    const last = node.arguments[node.arguments.length - 1];
    if (last && isNode(last, "Identifier")) {
      report(
        node,
        "extracted-handler",
        "ルートハンドラを名前付き関数として分離しない（パスパラメータの型推論が壊れる）"
      );
    }

    if (!isInResourceDir(normalizedFile) || isCompositionIndex(normalizedFile) || inHandlers)
      return;
    if (!isRoutesTable(normalizedFile)) {
      report(node, "routes-outside-table", "ルートは routes.ts の対応表にだけ書く");
    } else if (!(last && isNode(last, "Identifier"))) {
      checkTableRoute(node, method);
    } else {
      report(
        node,
        "inline-handler",
        "routes.ts にハンドラを直書きしない（handlers/ から ...spread する）"
      );
    }
  };

  const visit = (node: Node): void => {
    if (!inApi) {
      if (isNode(node, "CallExpression") && isNode(node.callee, "MemberExpression")) {
        const method = node.callee.computed ? "" : (propertyName(node.callee.property) ?? "");
        if (method === "on" && isOnRoute(node))
          report(node, "on-method", "`.on(` でルートを定義しない");
        else if (isRouteDefinition(node, method) && isMountedHandlerCall(node))
          report(
            node,
            "routes-outside-api",
            "ルート定義は server/api の中だけ（外では .route() のマウントだけにする）"
          );
      }
      forEachChild(node, visit);
      return;
    }

    if (isNode(node, "NewExpression") && isHonoIdentifier(node.callee) && node.typeArguments) {
      report(
        node,
        "typed-hono-constructor",
        "Env 型付きの new Hono<Env>() は使わない。createFactory<Env>() で共有する"
      );
    }

    if (
      isNode(node, "CallExpression") &&
      isNode(node.callee, "MemberExpression") &&
      !node.callee.computed
    ) {
      const method = propertyName(node.callee.property) ?? "";
      if (method === "on" && isOnRoute(node)) {
        report(node, "on-method", "`.on(` でルートを定義しない（.get / .post などで書く）");
      } else if (isRouteDefinition(node, method)) {
        checkRouteCall(node, method);
      }
    }

    if (isNode(node, "CallExpression") && (isReqParamCall(node) || isPathParamCall(node))) {
      report(
        node,
        "raw-param",
        "パス引数は c.req.param() / pathParam() で読まず zValidator('param') で受ける"
      );
    }

    if (inHandlers && isNode(node, "ExportNamedDeclaration")) {
      for (const { name, at } of exportedNames(node)) {
        if (ACTIONS.has(name)) continue;
        report(
          at,
          "unknown-action",
          `handlers/ の export 名は ${[...ACTIONS].join(" / ")} に限る: ${name}`
        );
      }
    }

    if (
      inHandlers &&
      isNode(node, "CallExpression") &&
      isRawResponseCall(node, activeHandlerContextNames)
    ) {
      report(
        node,
        "raw-response",
        "handlers/ では context.json() / context.text() / context.html() / context.redirect() を直接呼ばない（レスポンスの語彙を @/server/lib/http に揃える）"
      );
    }

    if (
      inHandlers &&
      isNode(node, "NewExpression") &&
      isRawResponseConstructor(node) &&
      activeHandlerContextNames.size > 0
    ) {
      report(
        node,
        "raw-response",
        "handlers/ では new Response() を直接使わない（レスポンスの語彙を @/server/lib/http に揃える）"
      );
    }

    if (inHandlers && isNode(node, "CallExpression") && isCreateHandlersCall(node)) {
      const previousContextNames = activeHandlerContextNames;
      activeHandlerContextNames = new Set([
        ...previousContextNames,
        ...collectCreateHandlersContextNames(node)
      ]);
      forEachChild(node, visit);
      activeHandlerContextNames = previousContextNames;
      return;
    }

    forEachChild(node, visit);
  };

  visit(sourceFile.program);
  return violations;
}

export const RUNNER_FIX = [
  FIX_EXTRACTED,
  FIX_TYPED_HONO,
  FIX_INDEX,
  FIX_TABLE,
  FIX_PARAM,
  FIX_RESPONSE,
  FIX_ACTION,
  FIX_ACTION_METHOD,
  FIX_HANDLER_DIR,
  FIX_INFLECTION,
  FIX_STATIC_ROUTE_PATH,
  FIX_ON,
  FIX_OUTSIDE_API
].join("\n");
export const FILE_RULE: FileRule = {
  include: /^server\/.*\.tsx?$/,
  exclude: /\.test\.tsx?$/,
  check: (file, source) => findHonoStyleViolations(file, source)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:hono-style"]));

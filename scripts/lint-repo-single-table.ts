/**
 * `*-repository/` 配下の実装（テストを除く）が扱うテーブルは 1 つにする。
 * `@/server/db/schema` から値として import するテーブルが 2 つ以上、または namespace import を検出する。
 * 例外は行コメント `// lint:allow-multi-table: <理由>`（理由必須）で、外せるのは複数テーブルだけ。namespace import は例外なしで禁止。
 */
import { isNode, lineOf, parseTypeScript, stringValue } from "./lib/lint-ast";
import type { FileRule } from "./lib/lint-runner-engine";

export type RepoSingleTableViolation = {
  file: string;
  line: number;
  rule: "multi-table" | "namespace-import" | "missing-reason";
  tables?: string[];
};

const FILE_RE = /^server\/repositories\/[^/]+-repository\/(?:.+\/)?(?!.*\.test\.ts$)[^/]+\.ts$/;
const SCHEMA_RE = /^@\/server\/db\/schema(\/.*)?$/;
const ALLOW_RE = /^[ \t]*\/\/[ \t]*lint:allow-multi-table:(.*)$/gm;

type Analysis = {
  violations: RepoSingleTableViolation[];
  tables: Set<string>;
  firstLine: number;
  reasoned: boolean;
};

function analyze(rel: string, source: string): Analysis {
  const parsed = parseTypeScript(rel, source);
  const allows = [...source.matchAll(ALLOW_RE)];
  const reasoned = allows.some((m) => (m[1] ?? "").trim() !== "");
  const violations: RepoSingleTableViolation[] = [];
  allows.forEach((m) => {
    if ((m[1] ?? "").trim() === "")
      violations.push({
        file: rel,
        line: source.slice(0, m.index).split("\n").length,
        rule: "missing-reason"
      });
  });

  const tables = new Set<string>();
  let firstLine = 0;
  for (const stmt of parsed.program.body) {
    if (!isNode(stmt, "ImportDeclaration") || stmt.importKind === "type") continue;
    const from = stringValue(stmt.source);
    if (!from || !SCHEMA_RE.test(from)) continue;
    for (const spec of stmt.specifiers) {
      if (isNode(spec, "ImportNamespaceSpecifier")) {
        violations.push({ file: rel, line: lineOf(parsed, stmt), rule: "namespace-import" });
      } else if (isNode(spec, "ImportSpecifier") && spec.importKind !== "type") {
        const imported = spec.imported;
        tables.add(isNode(imported, "Identifier") ? imported.name : String(imported.value));
        firstLine ||= lineOf(parsed, stmt);
      }
    }
  }
  if (tables.size > 1 && !reasoned)
    violations.push({ file: rel, line: firstLine, rule: "multi-table", tables: [...tables] });
  return { violations, tables, firstLine, reasoned };
}

export function findRepoSingleTableViolations(
  file: string,
  source: string
): RepoSingleTableViolation[] {
  const rel = file.replaceAll("\\", "/");
  if (!FILE_RE.test(rel)) return [];
  return analyze(rel, source).violations;
}

/** 1 フォルダ（1 repository）で使うテーブルは、フォルダの全ファイルを合わせて 1 つ。例外コメントのあるファイルは合計から外す。 */
export function repoSingleTableRule(): FileRule {
  const folders = new Map<string, Set<string>>();
  return {
    include: FILE_RE,
    ast: true,
    optional: true,
    check: (file, source) => {
      const rel = file.replaceAll("\\", "/");
      if (!FILE_RE.test(rel)) return [];
      const { violations, tables, firstLine, reasoned } = analyze(rel, source);
      if (reasoned || tables.size === 0) return violations;
      const folder = rel.split("/").slice(0, 3).join("/");
      const total = folders.get(folder) ?? new Set<string>();
      folders.set(folder, total);
      const before = total.size;
      for (const t of tables) total.add(t);
      if (tables.size <= 1 && before > 0 && total.size > 1)
        violations.push({ file: rel, line: firstLine, rule: "multi-table", tables: [...total] });
      return violations;
    }
  };
}

export const RUNNER_FIX =
  "Fix: repository は 1 テーブルだけ扱い、テーブルをまたぐ処理は service で組み合わせる（読み取りの集計で分けられないものだけ `// lint:allow-multi-table: <理由>`）";

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:repo-single-table"]));

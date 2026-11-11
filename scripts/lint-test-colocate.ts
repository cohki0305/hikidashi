/** テストを実装の隣に置き、API handlers・services・repositories・hooks を {name}/index.ts にする。 */
import path from "node:path";
import type { FileRule } from "./lib/lint-runner-engine";

export type TestColocateViolation = {
  file: string;
  rule: "test-in-tests-dir" | "flat-file" | "missing-test" | "missing-implementation";
  message: string;
};

const TEST_RE = /\.test\.tsx?$/;
const FLAT_RULES: { pattern: RegExp; message: string }[] = [
  {
    pattern: /^server\/api\/.+\/handlers\/[^/]+\.tsx?$/,
    message: "ハンドラは server/api/.../handlers/{sub}/index.ts に置き、テストは同じディレクトリへ"
  },
  {
    pattern: /^server\/services\/[^/]+\.tsx?$/,
    message: "サービスは server/services/{name}-service/index.ts に置き、テストは同じディレクトリへ"
  },
  {
    pattern: /^server\/repositories\/[^/]+\.tsx?$/,
    message:
      "リポジトリは server/repositories/{table}-repository/index.ts に置き、テストは同じディレクトリへ"
  },
  {
    pattern: /^app\/hooks\/[^/]+\.tsx?$/,
    message: "hook は app/hooks/use-{name}/index.ts に置き、テストは同じディレクトリへ"
  }
];

/** テストの有無を調べる範囲。 */
const SCOPE_RE = /^(app|server|shared|scripts)\/.+\.tsx?$/;

/** missing-test を免除する規則。種類を増やさず、1 件ずつ理由を書く。 */
export const MISSING_TEST_EXEMPT: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\/)types\.ts$/, reason: "型だけのファイル（実行される文が無い）" },
  { pattern: /\.d\.ts$/, reason: "型宣言だけのファイル（実行される文が無い）" },
  { pattern: /^app\/main\.tsx$/, reason: "起動の入口" },
  { pattern: /^server\/entry\/[^/]+\.ts$/, reason: "起動の入口" },
  { pattern: /\.config\.ts$/, reason: "設定ファイル" },
  { pattern: /^app\/routeTree\.gen\.ts$/, reason: "生成物" },
  {
    pattern: /^server\/db\/schema\/[^/]+\.ts$/,
    reason: "drizzle のテーブル定義（全体を見るテストは server/db/schema/index.test.ts に置く）"
  }
];

/** missing-implementation を免除するテスト。実装がファイルでないものだけを、理由付きで入れる。 */
export const MISSING_IMPLEMENTATION_ALLOW: readonly { file: string; reason: string }[] = [
  {
    file: "scripts/lint-deps.test.ts",
    reason: "実装は dependency-cruiser の設定全体で、1 つの .ts ではない"
  }
];

const isExemptFromTest = (rel: string) =>
  rel.startsWith("tests/") || MISSING_TEST_EXEMPT.some((e) => e.pattern.test(rel));

export function findTestColocateViolations(
  file: string,
  files: readonly string[]
): TestColocateViolation[] {
  const rel = file.replaceAll("\\", "/");
  if (TEST_RE.test(rel)) {
    if (rel.startsWith("tests/") && !rel.startsWith("tests/helpers/"))
      return [
        {
          file: rel,
          rule: "test-in-tests-dir",
          message: "tests/ にテストを置かない。対象の隣へ *.test.ts を移す"
        }
      ];
    if (!SCOPE_RE.test(rel) || MISSING_IMPLEMENTATION_ALLOW.some((a) => a.file === rel)) return [];
    const base = rel.replace(/\.test\.tsx?$/, "");
    if (files.includes(`${base}.ts`) || files.includes(`${base}.tsx`)) return [];
    return [
      {
        file: rel,
        rule: "missing-implementation",
        message: "隣に同名の実装（.ts / .tsx）が無い。テストは対象の隣へ移す"
      }
    ];
  }
  const flat = FLAT_RULES.find((r) => r.pattern.test(rel));
  if (flat) return [{ file: rel, rule: "flat-file", message: flat.message }];
  if (!SCOPE_RE.test(rel) || isExemptFromTest(rel)) return [];
  const base = rel.replace(/\.tsx?$/, "");
  if (files.includes(`${base}.test.ts`) || files.includes(`${base}.test.tsx`)) return [];
  return [
    { file: rel, rule: "missing-test", message: `隣に ${path.posix.basename(base)}.test.ts が無い` }
  ];
}

export const RUNNER_FIX =
  "Fix: テストは対象の隣へ置く。handlers・services・repositories・hooks は {name}/index.ts と隣の index.test.ts にする";
export const testColocateRule = (files: readonly string[]): FileRule => ({
  include: (file) => /^tests\/.*\.test\.tsx?$/.test(file) || SCOPE_RE.test(file),
  check: (file) => findTestColocateViolations(file, files)
});

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:test-colocate"]));

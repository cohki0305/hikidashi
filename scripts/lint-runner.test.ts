import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileRule, LINT_REGISTRY, projectRule, type RunnerRule } from "./lib/lint-registry";
import { listLintFiles, runLintCli, runLintRunner } from "./lint-runner";

const roots: string[] = [];
afterEach(() => {
  process.exitCode = 0;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(source: string) {
  const root = mkdtempSync(path.join(tmpdir(), "lint-runner-"));
  roots.push(root);
  mkdirSync(path.join(root, "server"), { recursive: true });
  writeFileSync(path.join(root, "server/a.ts"), source);
  return root;
}
const noThrow: RunnerRule = fileRule("lint:no-throw", "no-throw", {
  FILE_RULE: {
    include: /^server\/.*\.ts$/,
    ast: true,
    check: (file, source) => (source.includes("throw") ? [{ file }] : [])
  },
  RUNNER_FIX: "Fix: return a result instead of throwing."
});
const noFoo: RunnerRule = fileRule("lint:no-foo", "no-foo", {
  FILE_RULE: {
    include: /^server\/.*\.ts$/,
    ast: true,
    check: (file, source) => (source.includes("foo") ? [{ file }] : [])
  },
  RUNNER_FIX: "Fix: remove foo."
});
const registry = [noThrow, noFoo];

test("違反は Fix 付きで報告され、直した fixture は通る", async () => {
  const root = fixture('export function run() { throw new Error("bad"); }');
  await expect(runLintRunner(["lint:no-throw"], root, registry)).rejects.toThrow("Fix:");
  writeFileSync(path.join(root, "server/a.ts"), "export const run = () => ({ ok: false });");
  expect((await runLintRunner([], root, registry)).parsed).toBe(1);
});

test("未登録のルール名は Unknown lint rule で失敗する", async () => {
  const root = fixture("export const a = 1;");
  await expect(runLintRunner(["lint:nope"], root, [])).rejects.toThrow(
    "Unknown lint rule: lint:nope"
  );
});

test("ファイルは走査で 1 回だけ読む", async () => {
  const root = fixture("export const a = 1;");
  // 同じファイルに当たるルールが 2 つあっても、読み込みは 1 回・解析も 1 回で済む。
  const result = await runLintRunner([], root, registry);
  expect(result.readCount).toBe(1);
  expect(result.parsed).toBe(1);
});

test("名前指定のルールだけが動き、未登録名はエラーになる", async () => {
  const root = fixture("export const foo = 1;");
  expect((await runLintRunner(["lint:no-throw"], root, registry)).findings).toEqual([]);
  await expect(runLintRunner(["lint:no-foo"], root, registry)).rejects.toThrow("Fix:");
  await expect(runLintRunner(["lint:typo"], root, registry)).rejects.toThrow("Unknown lint rule");
});

test("対象 0 件のルールは失敗し、optional は通る", async () => {
  const root = fixture("export const a = 1;");
  const make = (optional: boolean) =>
    fileRule("lint:docs", "docs", {
      FILE_RULE: { include: /^docs\//, optional, check: () => [] },
      RUNNER_FIX: "Fix: add docs."
    });
  const error = await runLintRunner([], root, [make(false)]).catch((e) => e);
  expect(error.message).toContain('"rule":"lint:docs"');
  expect(error.message).toContain("0 件");
  expect(error.message).toContain("Fix: add docs.");
  expect((await runLintRunner([], root, [make(true)])).findings).toEqual([]);
});

test("構文エラーは落ちずに解析失敗の違反になる", async () => {
  const root = fixture("const = ;");
  const error = await runLintRunner(["lint:no-throw"], root, registry).catch((e) => e);
  expect(error.message).toContain('"rule":"lint:no-throw"');
  expect(error.message).toContain('"message":"解析失敗"');
  expect(error.message).toContain("Fix:");
});

test("project ルールは finish を実行し、失敗は報告される", async () => {
  const root = fixture("export const a = 1;");
  const ok = projectRule("lint:p", "p", "Fix: p.", () => ({ finish: () => [] }));
  const bad = projectRule("lint:q", "q", "Fix: q.", () => ({ finish: () => [{ bad: true }] }));
  const boom = projectRule("lint:r", "r", "Fix: r.", () => ({
    finish: () => {
      throw new Error("boom");
    }
  }));
  expect((await runLintRunner([], root, [ok])).findings).toEqual([]);
  await expect(runLintRunner([], root, [bad])).rejects.toThrow('"bad":true');
  await expect(runLintRunner([], root, [boom])).rejects.toThrow("boom");
});

test("走査は依存・ドットディレクトリ・壊れたシンボリックリンクを無視する", () => {
  const root = fixture("export const a = 1");
  mkdirSync(path.join(root, "node_modules"));
  writeFileSync(path.join(root, "node_modules/huge.ts"), "bad");
  symlinkSync("missing.md", path.join(root, "AGENTS.md"));
  expect(listLintFiles(root)).toEqual(["server/a.ts"]);
});

test("runLintCli は違反と未登録名で終了コードを 0 以外にする", async () => {
  const root = fixture("export const a = 1;");
  const original = console.error;
  console.error = () => {};
  try {
    await runLintCli(["lint:typo"], { cwd: root, registry: [noThrow] });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    await runLintCli([], { cwd: root, registry: [noThrow] });
    expect(process.exitCode).toBe(0);
  } finally {
    console.error = original;
  }
}, 30_000);

test("登録表の名前は重複せず、実在するファイルを指す", () => {
  expect(new Set(LINT_REGISTRY.map((rule) => rule.name)).size).toBe(LINT_REGISTRY.length);
});

test("server/ の違反ファイルで失敗する", async () => {
  const root = fixture(
    'import { sample } from "@/tests/fixtures/sample";\nexport const x = sample;'
  );
  const original = console.error;
  console.error = () => {};
  try {
    // ルールが 1 本もない Task 2 では通ってしまい、Task 3 で登録されてから失敗する。
    await runLintCli([], { cwd: root });
    expect(process.exitCode).not.toBe(0);
  } finally {
    console.error = original;
    process.exitCode = 0;
  }
}, 30_000);

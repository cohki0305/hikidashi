import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { LINT_REGISTRY, type RunnerRule } from "./lib/lint-registry";
import { runFileRules } from "./lib/lint-runner-engine";

const DEFAULT_REGISTRY = LINT_REGISTRY;

export function listLintFiles(cwd: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(cwd, dir), { withFileTypes: true })) {
      // 依存・ビルド成果物は走査範囲でなく、worktree の .git はファイルの場合もある。
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        (!dir && ["dist", "coverage"].includes(entry.name))
      )
        continue;
      const file = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (
        entry.isFile() ||
        (entry.isSymbolicLink() &&
          existsSync(path.join(cwd, file)) &&
          statSync(path.join(cwd, file)).isFile())
      )
        files.push(file);
    }
  };
  walk("");
  return files.sort();
}

export async function runLintRunner(
  names: readonly string[] = [],
  cwd = process.cwd(),
  registry: readonly RunnerRule[] = DEFAULT_REGISTRY
) {
  for (const name of names)
    if (!registry.some((rule) => rule.name === name))
      throw new Error(`Unknown lint rule: ${name}. Fix: choose a registered lint:xxx name.`);
  const selected = registry.filter((rule) => names.length === 0 || names.includes(rule.name));
  const files = listLintFiles(cwd);
  // 準備時に読んだ内容が走査にも現れる場合、同じファイルを読み直さない。
  const cache = new Map<string, string>();
  let readCount = 0;
  const read = (file: string) => {
    let source = cache.get(file);
    if (source === undefined) {
      source = readFileSync(path.join(cwd, file), "utf8");
      readCount++;
      cache.set(file, source);
    }
    return source;
  };
  const executions = selected.map((rule) => ({
    rule,
    execution: rule.create({ cwd, files, read })
  }));
  const checks = executions.flatMap(({ rule, execution }) =>
    (execution.checks ?? []).map((check) => ({ rule, check }))
  );
  const result = runFileRules(
    files,
    checks.map(({ check }) => check),
    (file) => {
      const source = read(file);
      cache.delete(file);
      return source;
    },
    { names: checks.map(({ rule }) => rule.name) }
  );
  cache.clear();
  const failures: string[] = [];
  const report = (name: string, fix: string, violations: readonly object[]) => {
    if (violations.length)
      failures.push(
        `${name}:\n${violations.map((v) => `  ${JSON.stringify(v)}`).join("\n")}\n  ${fix}`
      );
  };
  for (const { rule } of executions)
    report(
      rule.name,
      rule.fix,
      result.findings.filter((v) => checks[v.rule].rule === rule).map((v) => v.violation)
    );
  for (const { rule, execution } of executions) {
    try {
      report(rule.name, rule.fix, (await execution.finish?.()) ?? []);
    } catch (error) {
      failures.push(
        `${rule.name}: ${error instanceof Error ? error.message : String(error)}\n  ${rule.fix}`
      );
    }
  }
  if (failures.length) throw new Error(failures.join("\n\n"));
  console.log(
    `✅ lint:custom: ${selected.length} rules, ${readCount} files read, ${result.parsed} files parsed`
  );
  return { ...result, readCount };
}

export async function runLintCli(
  argv: string[] = process.argv.slice(2),
  options: { cwd?: string; registry?: readonly RunnerRule[] } = {}
) {
  try {
    await runLintRunner(argv, options.cwd, options.registry);
    process.exitCode = 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
if (import.meta.main) await runLintCli();

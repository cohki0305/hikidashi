import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileRule, LINT_REGISTRY, projectRule } from "@/scripts/lib/lint-registry";
import { type FileRule, runFileRules } from "@/scripts/lib/lint-runner-engine";
import { listLintFiles } from "@/scripts/lint-runner";

describe("LINT_REGISTRY", () => {
  test("ルール名は重複せず、lint: で始まる", () => {
    const names = LINT_REGISTRY.map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.startsWith("lint:")).toBe(true);
  });

  test("どのルールも実在するファイルと Fix の説明を持つ", () => {
    for (const rule of LINT_REGISTRY) {
      expect(existsSync(rule.file)).toBe(true);
      expect(rule.fix.length).toBeGreaterThan(0);
    }
  });

  test("実リポジトリで必須ルールの対象が 0 件にならない", () => {
    const cwd = process.cwd();
    const files = listLintFiles(cwd);
    const read = (file: string) => readFileSync(path.join(cwd, file), "utf8");
    const context = { cwd, files, read };
    const checks = LINT_REGISTRY.flatMap((rule) =>
      (rule.create(context).checks ?? []).map((check) => ({ rule, check }))
    );
    const { findings } = runFileRules(
      files,
      checks.map(({ check }) => check),
      read,
      { names: checks.map(({ rule }) => rule.name) }
    );
    const empty = findings
      .map(({ violation }) => violation as { file?: string })
      .filter((violation) => violation.file === "(対象なし)");
    expect(empty).toEqual([]);
  });
});

describe("fileRule", () => {
  test("モジュールの FILE_RULE と RUNNER_FIX を使う", () => {
    const FILE_RULE: FileRule = { include: /x/, check: () => [] };
    const rule = fileRule("lint:x", "x", { FILE_RULE, RUNNER_FIX: "直す" });
    expect(rule.file).toBe("scripts/lint-x.ts");
    expect(rule.fix).toBe("直す");
    expect(rule.create({ cwd: ".", files: [], read: () => "" }).checks).toEqual([FILE_RULE]);
  });
});

describe("projectRule", () => {
  test("渡した create をそのまま使う", () => {
    const create = () => ({ checks: [] });
    const rule = projectRule("lint:y", "y", "直す", create);
    expect(rule).toEqual({ name: "lint:y", file: "scripts/lint-y.ts", fix: "直す", create });
  });
});

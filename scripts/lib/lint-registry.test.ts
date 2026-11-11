import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileRule, LINT_REGISTRY, projectRule } from "@/scripts/lib/lint-registry";
import type { FileRule } from "@/scripts/lib/lint-runner-engine";

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

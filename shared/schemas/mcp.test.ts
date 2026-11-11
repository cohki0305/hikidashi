import { describe, expect, test } from "bun:test";
import { checkSkillUpdatesInputSchema, listSkillsInputSchema } from "./mcp";

const installed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `skill-${index}`,
    version: 1,
    fingerprint: "a".repeat(64)
  }));

describe("MCP ツールの入力", () => {
  test("list_skills は query 無しでも受ける", () => {
    expect(listSkillsInputSchema.safeParse({}).success).toBe(true);
    expect(listSkillsInputSchema.safeParse({ query: "見積" }).success).toBe(true);
    expect(listSkillsInputSchema.safeParse({ query: 1 }).success).toBe(false);
    expect(listSkillsInputSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
  });

  test("check_skill_updates は 200 件まで受ける", () => {
    expect(checkSkillUpdatesInputSchema.safeParse({ installed: installed(200) }).success).toBe(
      true
    );
  });

  test("check_skill_updates は 201 件を拒否する", () => {
    expect(checkSkillUpdatesInputSchema.safeParse({ installed: installed(201) }).success).toBe(
      false
    );
  });

  test("check_skill_updates は版番号の無い・負の入力を拒否する", () => {
    expect(
      checkSkillUpdatesInputSchema.safeParse({
        installed: [{ name: "skill-a", version: 0, fingerprint: "f" }]
      }).success
    ).toBe(false);
    expect(
      checkSkillUpdatesInputSchema.safeParse({
        installed: [{ name: "skill-a", fingerprint: "f" }]
      }).success
    ).toBe(false);
  });
});

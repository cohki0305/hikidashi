import { describe, expect, test } from "bun:test";
import {
  previewQuerySchema,
  skillListQuerySchema,
  skillNameParamsSchema,
  skillVersionParamsSchema
} from "./skill";

describe("skillNameParamsSchema", () => {
  test("スキル名を通し、規則に合わない名前を弾く", () => {
    expect(skillNameParamsSchema.safeParse({ skillName: "team-skill" }).success).toBe(true);
    expect(skillNameParamsSchema.safeParse({ skillName: "TeamSkill" }).success).toBe(false);
  });
});

describe("skillVersionParamsSchema", () => {
  test("1 以上の整数の版を通す", () => {
    expect(
      skillVersionParamsSchema.safeParse({ skillName: "team-skill", version: "2" }).success
    ).toBe(true);
  });

  test("数字でない・0 の版を弾く", () => {
    expect(
      skillVersionParamsSchema.safeParse({ skillName: "team-skill", version: "abc" }).success
    ).toBe(false);
    expect(
      skillVersionParamsSchema.safeParse({ skillName: "team-skill", version: "0" }).success
    ).toBe(false);
  });
});

describe("skillListQuerySchema", () => {
  test("query が無ければ空文字にする", () => {
    expect(skillListQuerySchema.parse({})).toEqual({ query: "" });
  });
});

describe("previewQuerySchema", () => {
  test("スキル内の相対パスを通し、外に出るパスを弾く", () => {
    expect(previewQuerySchema.safeParse({ path: "SKILL.md" }).success).toBe(true);
    expect(previewQuerySchema.safeParse({ path: "scripts/run.md" }).success).toBe(true);
    expect(previewQuerySchema.safeParse({ path: "../x" }).success).toBe(false);
    expect(previewQuerySchema.safeParse({ path: "/x" }).success).toBe(false);
  });
});

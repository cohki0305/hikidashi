import { describe, expect, it } from "bun:test";
import {
  type SkillSummary,
  skillDetailResponseSchema,
  skillFileSchema,
  skillListResponseSchema,
  skillNameSchema,
  skillSummarySchema,
  skillVersionSchema
} from "./skills";

const validSummary: SkillSummary = {
  name: "team-skill",
  title: "チームのスキル",
  description: "チームで使うスキルです",
  latestVersion: 3,
  updatedAt: "2026-11-11T10:00:00.000Z",
  author: "member@example.com",
  sizeBytes: 12345,
  claudeCodeOnly: false
};

describe("skillNameSchema", () => {
  it("英小文字・数字・ハイフンだけの名前を通す", () => {
    expect(skillNameSchema.safeParse("team-skill-1").success).toBe(true);
  });

  it("大文字を含む名前を弾く", () => {
    expect(skillNameSchema.safeParse("TeamSkill").success).toBe(false);
  });

  it("アンダースコアを含む名前を弾く", () => {
    expect(skillNameSchema.safeParse("team_skill").success).toBe(false);
  });

  it("65 文字の名前を弾き、64 文字の名前を通す", () => {
    expect(skillNameSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(skillNameSchema.safeParse("a".repeat(64)).success).toBe(true);
  });
});

describe("skillSummarySchema", () => {
  it("正しい例を通す", () => {
    expect(skillSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it("latestVersion が 0 以下なら弾く", () => {
    expect(skillSummarySchema.safeParse({ ...validSummary, latestVersion: 0 }).success).toBe(false);
    expect(skillSummarySchema.safeParse({ ...validSummary, latestVersion: -1 }).success).toBe(
      false
    );
  });

  it("updatedAt が ISO 8601 の日時でなければ弾く", () => {
    expect(skillSummarySchema.safeParse({ ...validSummary, updatedAt: "2026-11-11" }).success).toBe(
      false
    );
  });
});

describe("skillListResponseSchema", () => {
  it("スキルの一覧を通す", () => {
    expect(skillListResponseSchema.safeParse({ skills: [validSummary] }).success).toBe(true);
  });

  it("skills が無ければ弾く", () => {
    expect(skillListResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("skillFileSchema", () => {
  it("ファイルの情報を通す", () => {
    expect(
      skillFileSchema.safeParse({ path: "SKILL.md", sizeBytes: 1024, isText: true }).success
    ).toBe(true);
  });

  it("path が空なら弾く", () => {
    expect(skillFileSchema.safeParse({ path: "", sizeBytes: 1024, isText: true }).success).toBe(
      false
    );
  });
});

describe("skillVersionSchema", () => {
  it("note が null の版を通す", () => {
    expect(
      skillVersionSchema.safeParse({
        version: 1,
        note: null,
        publishedBy: "member@example.com",
        createdAt: "2026-11-11T10:00:00.000Z",
        fingerprint: "abc123",
        sizeBytes: 2048,
        fileCount: 3
      }).success
    ).toBe(true);
  });

  it("version が 0 以下なら弾く", () => {
    expect(
      skillVersionSchema.safeParse({
        version: 0,
        note: "初版",
        publishedBy: "member@example.com",
        createdAt: "2026-11-11T10:00:00.000Z",
        fingerprint: "abc123",
        sizeBytes: 2048,
        fileCount: 3
      }).success
    ).toBe(false);
  });
});

describe("skillDetailResponseSchema", () => {
  it("スキル・ファイル・版の一覧を通す", () => {
    expect(
      skillDetailResponseSchema.safeParse({
        skill: validSummary,
        files: [{ path: "SKILL.md", sizeBytes: 1024, isText: true }],
        versions: [
          {
            version: 3,
            note: "説明を更新",
            publishedBy: "member@example.com",
            createdAt: "2026-11-11T10:00:00.000Z",
            fingerprint: "abc123",
            sizeBytes: 2048,
            fileCount: 3
          }
        ]
      }).success
    ).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { skillDetailResponseSchema, skillListResponseSchema } from "@/shared/schemas/skills";
import { mockDetail, mockSkills } from "./data";

describe("偽のデータ", () => {
  test("7 件で、スキーマに合う", () => {
    expect(mockSkills).toHaveLength(7);
    expect(skillListResponseSchema.safeParse({ skills: mockSkills }).success).toBe(true);
  });

  test("動画の字幕入れは Claude Code 専用で 95MB", () => {
    const detail = mockDetail("video-subtitles");
    expect(detail?.skill.claudeCodeOnly).toBe(true);
    expect(detail?.skill.sizeBytes).toBe(95 * 1024 * 1024);
    expect(detail?.files.some((f) => f.path.endsWith(".mp4"))).toBe(true);
    expect(skillDetailResponseSchema.safeParse(detail).success).toBe(true);
  });

  test("無い名前は null", () => {
    expect(mockDetail("nothing")).toBeNull();
  });
});

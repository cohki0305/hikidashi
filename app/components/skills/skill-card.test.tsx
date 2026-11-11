import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { mockSkills } from "@/app/dev-mocks/data";
import { SkillCard } from "./skill-card";

afterEach(cleanup);

const minutes = mockSkills[0];
const video = mockSkills.find((s) => s.claudeCodeOnly);

describe("スキルのカード", () => {
  test("題名・説明・作者・版・日付を出す", () => {
    if (!minutes) throw new Error("データがありません");
    render(<SkillCard skill={minutes} />);
    expect(screen.getByText("議事録まとめ")).toBeTruthy();
    expect(screen.getByText(minutes.description)).toBeTruthy();
    expect(screen.getByText(minutes.author)).toBeTruthy();
    expect(screen.getByText("第3版")).toBeTruthy();
    expect(screen.getByText("11月10日")).toBeTruthy();
    expect(screen.queryByText("Claude Code 専用")).toBeNull();
  });

  test("詳細へのリンクになる", () => {
    if (!minutes) throw new Error("データがありません");
    render(<SkillCard skill={minutes} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/skills/${minutes.name}`);
  });

  test("Claude Code 専用のスキルに印が付く", () => {
    if (!video) throw new Error("データがありません");
    render(<SkillCard skill={video} />);
    expect(screen.getByText("Claude Code 専用")).toBeTruthy();
  });
});

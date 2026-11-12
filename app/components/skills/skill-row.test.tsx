import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { mockSkills } from "@/app/dev-mocks/data";
import { SkillListHeader, SkillRow } from "./skill-row";

afterEach(cleanup);

const minutes = mockSkills[0];
const video = mockSkills.find((s) => s.claudeCodeOnly);

describe("スキルの行", () => {
  test("名前・説明・作った人・版・日付を出す", () => {
    if (!minutes) throw new Error("データがありません");
    render(<SkillRow skill={minutes} />);
    expect(screen.getByText("議事録まとめ")).toBeTruthy();
    expect(screen.getByText(minutes.description)).toBeTruthy();
    expect(screen.getByText(minutes.author)).toBeTruthy();
    expect(screen.getByText("第3版")).toBeTruthy();
    expect(screen.getByText("11月10日")).toBeTruthy();
    expect(screen.queryByText("Claude Code 専用")).toBeNull();
  });

  test("詳細へのリンクになり、title に説明の全文が入る", () => {
    if (!minutes) throw new Error("データがありません");
    render(<SkillRow skill={minutes} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/skills/${minutes.name}`);
    expect(link.getAttribute("title")).toBe(minutes.description);
  });

  test("Claude Code 専用のスキルに印が付く", () => {
    if (!video) throw new Error("データがありません");
    render(<SkillRow skill={video} />);
    expect(screen.getByText("Claude Code 専用")).toBeTruthy();
  });
});

describe("スキル一覧の見出し行", () => {
  test("列の名前を出し、読み上げからは外す", () => {
    const { container } = render(<SkillListHeader />);
    for (const label of ["名前", "説明", "作った人", "更新日", "版"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

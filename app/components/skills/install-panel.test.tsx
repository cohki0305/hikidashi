import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InstallPanel } from "./install-panel";

afterEach(cleanup);

const base = { name: "minutes-summary", title: "議事録まとめ", version: 3 };

describe("手元に入れる", () => {
  test("Claude Code のタブに頼み方とコピーボタンが出る", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (t: string) => void copied.push(t) }
    });
    render(<InstallPanel {...base} claudeCodeOnly={false} />);
    expect(screen.getByRole("heading", { name: "手元に入れる" })).toBeTruthy();
    expect(screen.getByText("チームのスキル「議事録まとめ」を入れて")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "コピー済み" })).toBeTruthy());
    expect(copied).toEqual(["チームのスキル「議事録まとめ」を入れて"]);
  });

  test("claude.ai のタブに zip のリンクと手順が出る", () => {
    render(<InstallPanel {...base} claudeCodeOnly={false} />);
    fireEvent.click(screen.getByRole("tab", { name: "claude.ai" }));
    const link = screen.getByRole("link", { name: "zip をダウンロード" });
    expect(link.getAttribute("href")).toBe("/api/skills/minutes-summary/versions/3/download");
    expect(screen.getByText(/設定 › 機能 › スキル/)).toBeTruthy();
    expect(screen.queryByText("チームのスキル「議事録まとめ」を入れて")).toBeNull();
  });

  test("大きいスキルは claude.ai のタブで Claude Code 専用の案内になる", () => {
    render(<InstallPanel {...base} claudeCodeOnly={true} />);
    fireEvent.click(screen.getByRole("tab", { name: "claude.ai" }));
    expect(screen.getByText("このスキルは大きいため Claude Code でだけ使えます")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "zip をダウンロード" })).toBeNull();
  });
});

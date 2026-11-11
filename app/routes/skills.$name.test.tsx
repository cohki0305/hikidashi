import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockFetch } from "@/app/dev-mocks/fetch";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";

const actualRouter = { ...(await import("@tanstack/react-router")) };

function Link({ children, to, ...rest }: { children: ReactNode; to: string }) {
  return (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}

mock.module("@tanstack/react-router", () => ({ ...actualRouter, Link }));

const { SkillDetailPage } = await import("./skills.$name");

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
  globalThis.fetch = realFetch;
});

function renderPage(name: string) {
  setDefaultFetch(mockFetch);
  globalThis.fetch = mockFetch;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SkillDetailPage name={name} />
    </QueryClientProvider>
  );
}

describe("スキルの詳細", () => {
  test("見出し・説明・作者と版と更新日を出す", async () => {
    renderPage("minutes-summary");
    await waitFor(() => expect(screen.getByRole("heading", { name: "議事録まとめ" })).toBeTruthy());
    expect(
      screen.getByText("会議の文字起こしから、決まったこと・宿題・期限を表にまとめる。")
    ).toBeTruthy();
    expect(screen.getByText("suzuki@example.com ・ 第3版 ・ 11月10日に更新")).toBeTruthy();
    expect(screen.getByRole("link", { name: "← スキル一覧" })).toBeTruthy();
  });

  test("ファイルと版の履歴と手元に入れる欄が並び、SKILL.md の中身が出る", async () => {
    renderPage("minutes-summary");
    await waitFor(() => expect(screen.getByText(/内容を読む/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /template\.md/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "これまでの版" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "手元に入れる" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /template\.md/ }));
    await waitFor(() => expect(screen.getByText(/## 要約/)).toBeTruthy());
  });

  test("動画入りのスキルは動画の中身を取りに行かない", async () => {
    renderPage("video-subtitles");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "動画の字幕入れ" })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: /intro\.mp4/ }));
    expect(screen.getByText("プレビューできないファイルです")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "claude.ai" }));
    expect(screen.getByText("このスキルは大きいため Claude Code でだけ使えます")).toBeTruthy();
  });

  test("無いスキルは見つからない表示と一覧への戻り口", async () => {
    renderPage("nothing");
    await waitFor(() => expect(screen.getByText("このスキルは見つかりません")).toBeTruthy());
    expect(screen.getByRole("link", { name: "← スキル一覧" }).getAttribute("href")).toBe("/");
  });
});

import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockSkills } from "@/app/dev-mocks/data";
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

const { IndexPage } = await import("./index");

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
});

function renderPage(fetchImpl: typeof fetch = mockFetch) {
  setDefaultFetch(fetchImpl);
  render(
    <QueryClientProvider client={createQueryClient()}>
      <IndexPage />
    </QueryClientProvider>
  );
}

describe("スキル一覧", () => {
  test("見出しと説明と 7 件のカードが出る", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "チームのスキル" })).toBeTruthy();
    expect(
      screen.getByText("追加するときは、Claude に「このスキルをチームに公開して」と頼みます。")
    ).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("link", { name: /第\d+版/ }).length).toBe(7));
    expect(mockSkills.length).toBe(7);
    expect(screen.getByText("7 件")).toBeTruthy();
  });

  test("「議事録」で探すと 1 件になる", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("7 件")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("スキルを探す"), { target: { value: "議事録" } });
    expect(screen.getByText("「議事録」で 1 件")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /第\d+版/ }).length).toBe(1);
  });

  test("一致しなければ 0 件の空表示になる", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("7 件")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("スキルを探す"), { target: { value: "存在しない語" } });
    expect(screen.getByText("「存在しない語」で 0 件")).toBeTruthy();
    expect(screen.getByText("見つかるスキルはありません。")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /第\d+版/ }).length).toBe(0);
  });

  test("Claude Code 専用のカードに印が付き、カードは詳細へのリンクになる", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Claude Code 専用")).toBeTruthy());
    const link = screen.getByRole("link", { name: /動画の字幕入れ/ });
    expect(link.getAttribute("href")).toBe("/skills/video-subtitles");
  });

  test("応答の形が違うときは読み込めない案内を出す", async () => {
    const broken = (async () =>
      new Response(JSON.stringify({ skills: "x" }), {
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch;
    renderPage(broken);
    await waitFor(() =>
      expect(screen.getByText("読み込めませんでした。時間をおいて開き直してください")).toBeTruthy()
    );
  });

  test("検索のたびには問い合わせない", async () => {
    const urls: string[] = [];
    setDefaultFetch(((input: unknown, init?: RequestInit) => {
      urls.push(String(input));
      return mockFetch(input as string, init);
    }) as unknown as typeof fetch);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <IndexPage />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("7 件")).toBeTruthy());
    const before = urls.filter((u) => u.startsWith("/api/skills")).length;
    fireEvent.change(screen.getByLabelText("スキルを探す"), { target: { value: "議" } });
    fireEvent.change(screen.getByLabelText("スキルを探す"), { target: { value: "議事" } });
    expect(urls.filter((u) => u.startsWith("/api/skills")).length).toBe(before);
  });
});

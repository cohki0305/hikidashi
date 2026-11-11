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

const { ConnectPage } = await import("./connect");

const realClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
  if (realClipboard) Object.defineProperty(navigator, "clipboard", realClipboard);
});

function renderPage() {
  setDefaultFetch(mockFetch);
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ConnectPage />
    </QueryClientProvider>
  );
}

describe("つなぎ方", () => {
  test("コネクタの URL は今開いている場所から作って表示する", () => {
    renderPage();
    const input = screen.getByLabelText("コネクタの URL") as HTMLInputElement;
    expect(input.value).toBe(`${location.origin}/mcp`);
    expect(input.readOnly).toBe(true);
  });

  test("コピーを押すと URL がコピーされ、ボタンが「コピー済み」になる", async () => {
    const writeText = mock(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "コピー済み" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/mcp`);
  });

  test("手順が 3 つ並ぶ", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "つなぎ方（最初の 1 回だけ）" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBe(3);
    expect(
      screen.getByText("claude.ai でつなげば、同じアカウントの Claude Code からも使えます。")
    ).toBeTruthy();
  });

  test("頼み方の例が 3 つ（使う・探す・公開する）並ぶ", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Claude への頼み方" })).toBeTruthy();
    expect(screen.getByText("チームのスキル「議事録まとめ」を入れて")).toBeTruthy();
    expect(screen.getByText("チームに提案書向けのスキルはある？")).toBeTruthy();
    expect(screen.getByText("このスキルをチームに公開して")).toBeTruthy();
    for (const label of ["使う", "探す", "公開する"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test("公開の例の下に、公開は Claude Code からだけできると出る", () => {
    renderPage();
    expect(screen.getByText("公開は Claude Code からだけできます")).toBeTruthy();
  });
});

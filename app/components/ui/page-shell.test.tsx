import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const actualRouter = { ...(await import("@tanstack/react-router")) };

function Link({ children, to, ...rest }: { children: ReactNode; to: string }) {
  return (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}

mock.module("@tanstack/react-router", () => ({ ...actualRouter, Link }));

const { PageShell } = await import("./page-shell");

afterEach(cleanup);

describe("画面の枠", () => {
  test("ヘッダーと本文を出す", () => {
    render(
      <PageShell current="connect" email="sato@example.com">
        <p>本文</p>
      </PageShell>
    );
    expect(screen.getByText("本文")).toBeTruthy();
    expect(screen.getByText("sato@example.com")).toBeTruthy();
    expect(screen.getByText("つなぎ方").getAttribute("aria-current")).toBe("page");
  });

  test("本文は 1120px で中央に寄せる", () => {
    render(
      <PageShell current="skills">
        <p>本文</p>
      </PageShell>
    );
    const main = screen.getByRole("main");
    expect(main.style.maxWidth).toBe("1120px");
    expect(main.style.margin).toContain("auto");
  });
});

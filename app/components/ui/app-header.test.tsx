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

const { AppHeader } = await import("./app-header");

afterEach(cleanup);

describe("画面の上の帯", () => {
  test("現在のナビに下線と青が付く", () => {
    render(<AppHeader current="skills" email="sato@example.com" />);
    const now = screen.getByText("スキル");
    expect(now.getAttribute("aria-current")).toBe("page");
    expect(now.style.borderBottom).toContain("var(--color-primary)");
    expect(now.style.color).toBe("var(--color-primary)");
    const other = screen.getByText("つなぎ方");
    expect(other.getAttribute("aria-current")).toBeNull();
    expect(other.style.borderBottom).toBe("");
  });

  test("つなぎ方が現在のときはそちらに付く", () => {
    render(<AppHeader current="connect" />);
    expect(screen.getByText("つなぎ方").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("スキル").getAttribute("aria-current")).toBeNull();
  });

  test("メンバーが現在のときはそちらに付く", () => {
    render(<AppHeader current="members" />);
    expect(screen.getByText("メンバー").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("メンバー").getAttribute("href")).toBe("/members");
  });

  test("メールを表示する", () => {
    render(<AppHeader current="skills" email="sato@example.com" />);
    expect(screen.getByText("sato@example.com")).toBeTruthy();
  });

  test("ロゴを表示する", () => {
    render(<AppHeader current="skills" />);
    expect(screen.getByText("hikidashi")).toBeTruthy();
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { mockDetail } from "@/app/dev-mocks/data";
import { formatDate, VersionHistory } from "./version-history";

afterEach(cleanup);

describe("版の履歴", () => {
  test("渡された順（新しい順）に、版・日付・メモを並べる", () => {
    const detail = mockDetail("minutes-summary");
    if (!detail) throw new Error("データがありません");
    const { container } = render(<VersionHistory versions={detail.versions} />);
    expect(screen.getByRole("heading", { name: "これまでの版" })).toBeTruthy();
    const labels = [...container.querySelectorAll("[data-version]")].map((e) => e.textContent);
    expect(labels).toEqual(["第3版", "第2版", "第1版"]);
    expect(screen.getAllByText("11月10日").length).toBe(3);
    expect(screen.getByText("最新の内容に更新")).toBeTruthy();
  });

  test("日付は日本時間の月日", () => {
    expect(formatDate("2026-11-10T20:00:00.000Z")).toBe("11月11日");
  });
});

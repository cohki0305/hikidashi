import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { mockDetail } from "@/app/dev-mocks/data";
import { VersionHistory } from "./version-history";

afterEach(cleanup);

describe("版の履歴", () => {
  test("古い順で渡されても、新しい順に版・日付・メモを並べる", () => {
    const detail = mockDetail("minutes-summary");
    if (!detail) throw new Error("データがありません");
    const oldestFirst = [...detail.versions].reverse();
    const { container } = render(<VersionHistory versions={oldestFirst} />);
    expect(screen.getByRole("heading", { name: "これまでの版" })).toBeTruthy();
    const labels = [...container.querySelectorAll("[data-version]")].map((e) => e.textContent);
    expect(labels).toEqual(["第3版", "第2版", "第1版"]);
    expect(screen.getAllByText("11月10日").length).toBe(3);
    expect(screen.getByText("最新の内容に更新")).toBeTruthy();
  });
});

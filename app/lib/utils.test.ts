import { describe, expect, test } from "bun:test";
import { formatDate } from "./utils";

describe("formatDate", () => {
  test("日本時間の月日にする", () => {
    expect(formatDate("2026-11-10T20:00:00.000Z")).toBe("11月11日");
  });
});

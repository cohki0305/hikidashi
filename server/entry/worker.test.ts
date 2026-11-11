import { describe, expect, test } from "bun:test";
import { runScheduled } from "./worker";

describe("scheduled", () => {
  test("cleanupExpired を 1 回だけ呼ぶ", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const calls: Date[] = [];

    await runScheduled({}, now, () => ({
      cleanupExpired: async (at) => {
        calls.push(at);
        return { expired: 0 };
      }
    }));

    expect(calls).toEqual([now]);
  });

  test("D1 か R2 の束縛が無ければ何もしない", async () => {
    await runScheduled({}, new Date());
  });
});

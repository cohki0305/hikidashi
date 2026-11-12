import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { provideMemberService } from "./context";

describe("provideMemberService", () => {
  test("Service が無ければ 404 で入口を塞ぐ（fail closed）", async () => {
    const app = new Hono();
    app.use("*", provideMemberService(undefined));
    app.get("/members", (c) => c.json({ ok: true }));

    const res = await app.request("/members");

    expect(res.status).toBe(404);
  });
});

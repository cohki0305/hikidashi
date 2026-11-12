import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { requireMember } from "./require-member";

function buildApp(isMember: (email: string) => Promise<boolean>) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const email = c.req.header("x-email");
    if (email) c.set("email", email);
    await next();
  });
  app.use("*", requireMember(isMember));
  app.get("/secret", (c) => c.json({ email: c.var.email }));
  return app;
}

describe("requireMember", () => {
  it("メンバーなら次へ進む", async () => {
    const calls: string[] = [];
    const app = buildApp(async (email) => {
      calls.push(email);
      return true;
    });

    const res = await app.request("/secret", { headers: { "x-email": "member@example.com" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "member@example.com" });
    expect(calls).toEqual(["member@example.com"]);
  });

  it("メンバーでなければ 403 の not_member", async () => {
    const calls: string[] = [];
    const app = buildApp(async (email) => {
      calls.push(email);
      return false;
    });

    const res = await app.request("/secret", { headers: { "x-email": "nobody@example.com" } });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
    expect(calls).toEqual(["nobody@example.com"]);
  });

  it("メールが無ければ判定せず 403", async () => {
    let called = false;
    const app = buildApp(async () => {
      called = true;
      return true;
    });

    const res = await app.request("/secret");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
    expect(called).toBe(false);
  });
});

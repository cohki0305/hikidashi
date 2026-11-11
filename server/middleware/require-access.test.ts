import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, ok, type Result } from "@/server/lib/result";
import { type AccessEnv, requireAccess } from "./require-access";

function fakeVerifier(result: Result<{ email: string }>) {
  const calls: string[] = [];
  const verify: AccessVerifier = async (jwt) => {
    calls.push(jwt);
    return result;
  };
  return { verify, calls };
}

function buildApp(verify: AccessVerifier) {
  const app = new Hono<{ Bindings: AccessEnv }>();
  app.use("*", requireAccess(verify));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/secret", (c) => c.json({ email: c.var.email }));
  return app;
}

describe("requireAccess", () => {
  it("ヘッダーが無ければ 401", async () => {
    const { verify, calls } = fakeVerifier(ok({ email: "member@example.com" }));
    const res = await buildApp(verify).request("/api/secret", {}, {});
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("検証に失敗したら 401", async () => {
    const { verify } = fakeVerifier(forbidden("だめ"));
    const res = await buildApp(verify).request(
      "/api/secret",
      { headers: { "Cf-Access-Jwt-Assertion": "broken" } },
      {}
    );
    expect(res.status).toBe(401);
  });

  it("検証に成功したら c.var.email を入れて次へ進む", async () => {
    const { verify, calls } = fakeVerifier(ok({ email: "member@example.com" }));
    const res = await buildApp(verify).request(
      "/api/secret",
      { headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" } },
      {}
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "member@example.com" });
    expect(calls).toEqual(["valid-jwt"]);
  });

  it("APP_ENV=development のときだけ DEV_ACCESS_EMAIL を本人として通す", async () => {
    const { verify, calls } = fakeVerifier(forbidden("だめ"));
    const res = await buildApp(verify).request(
      "/api/secret",
      {},
      { APP_ENV: "development", DEV_ACCESS_EMAIL: "dev@example.com" }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "dev@example.com" });
    expect(calls).toEqual([]);
  });

  it("APP_ENV=production では DEV_ACCESS_EMAIL を無視する", async () => {
    const { verify, calls } = fakeVerifier(ok({ email: "member@example.com" }));
    const res = await buildApp(verify).request(
      "/api/secret",
      {},
      { APP_ENV: "production", DEV_ACCESS_EMAIL: "dev@example.com" }
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("APP_ENV が無ければ DEV_ACCESS_EMAIL を無視する", async () => {
    const { verify, calls } = fakeVerifier(ok({ email: "member@example.com" }));
    const res = await buildApp(verify).request(
      "/api/secret",
      {},
      { DEV_ACCESS_EMAIL: "dev@example.com" }
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("/api/health は本人確認を通さない", async () => {
    const { verify, calls } = fakeVerifier(forbidden("だめ"));
    const res = await buildApp(verify).request("/api/health", {}, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });
});

import { describe, expect, it } from "bun:test";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, ok } from "@/server/lib/result";
import { createApp } from "./app";

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

function fakeDeps() {
  const logged: { message: string; context: Record<string, unknown> }[] = [];
  return {
    logError: (message: string, context: Record<string, unknown>) => {
      logged.push({ message, context });
    },
    logged
  };
}

describe("createApp", () => {
  it("GET /api/health は 200 {ok:true}", async () => {
    const res = await createApp(fakeDeps()).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("認証済みで知らない /api の道は JSON の 404", async () => {
    const res = await createApp({ ...fakeDeps(), accessVerifier: verify }).request("/api/nope", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ kind: "not_found" });
  });

  it("まだ無い /api の道も認証なしは 401（fail closed）", async () => {
    const res = await createApp(fakeDeps()).request("/api/uploads");
    expect(res.status).toBe(401);
  });

  it("例外のメッセージを応答にもログにも出さない", async () => {
    const deps = fakeDeps();
    const app = createApp({ ...deps, accessVerifier: verify });
    app.get("/api/__throw", () => {
      throw new Error("田中太郎 090-0000-0000");
    });
    const res = await app.request("/api/__throw", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("田中");
    expect(JSON.stringify(deps.logged)).not.toContain("田中");
    expect(deps.logged[0]?.context).toMatchObject({ errorName: "Error" });
  });
});

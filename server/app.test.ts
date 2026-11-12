import { describe, expect, it } from "bun:test";
import type { OAuthServicePort } from "@/server/api/oauth";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, ok } from "@/server/lib/result";
import { createApp } from "./app";

const APP_URL = "https://hikidashi.example.test";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const oauthPort: OAuthServicePort = {
  register: async () =>
    ok({
      client_id: "c".repeat(32),
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    }),
  startAuthorization: async () => ok({ kind: "pending", requestId: "request-1" }),
  exchangeCode: async () =>
    ok({ accessToken: "hkd_at_x", refreshToken: "hkd_rt_x", expiresIn: 3600 }),
  refresh: async () => ok({ accessToken: "hkd_at_x", refreshToken: "hkd_rt_x", expiresIn: 3600 })
};

function allowMember() {
  return async () => true;
}

function denyMember() {
  return async () => false;
}

function authorizeQuery() {
  return new URLSearchParams({
    response_type: "code",
    client_id: "client-1",
    redirect_uri: REDIRECT,
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
    state: "st-1",
    resource: `${APP_URL}/mcp`
  }).toString();
}

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
    const res = await createApp({
      ...fakeDeps(),
      accessVerifier: verify,
      isMember: allowMember()
    }).request("/api/nope", {
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
    const app = createApp({ ...deps, accessVerifier: verify, isMember: allowMember() });
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

describe("メンバーでない人の入口", () => {
  it("/api/skills は 403 の not_member", async () => {
    const res = await createApp({
      ...fakeDeps(),
      accessVerifier: verify,
      isMember: denyMember()
    }).request("/api/skills", { headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" } });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
  });

  it("/api/me は 200 で isMember false", async () => {
    const res = await createApp({
      ...fakeDeps(),
      accessVerifier: verify,
      isMember: denyMember()
    }).request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "member@example.com", isMember: false });
  });

  it("/oauth/authorize は 403 で、許可の頼みを作らない", async () => {
    let started = 0;
    const res = await createApp({
      ...fakeDeps(),
      accessVerifier: verify,
      isMember: denyMember(),
      oauth: {
        ...oauthPort,
        startAuthorization: async () => {
          started += 1;
          return ok({ kind: "pending", requestId: "request-1" });
        }
      },
      appUrl: APP_URL
    }).request(`/oauth/authorize?${authorizeQuery()}`, {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
    expect(started).toBe(0);
  });

  it("新しく足した /api の道も自動で守る", async () => {
    const app = createApp({
      ...fakeDeps(),
      accessVerifier: verify,
      isMember: denyMember()
    });
    app.get("/api/__member-only", (c) => c.json({ ok: true }));

    const res = await app.request("/api/__member-only", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
  });
});

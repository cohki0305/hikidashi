import { describe, expect, test } from "bun:test";
import type { OAuthServicePort } from "@/server/api/oauth";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, invalid, ok, upstream } from "@/server/lib/result";

const APP_URL = "https://hikidashi.example.test";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const TOKENS = { accessToken: "hkd_at_fake", refreshToken: "hkd_rt_fake", expiresIn: 3600 };
const ACCESS = { "Cf-Access-Jwt-Assertion": "valid-jwt" };

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

type Calls = {
  register: unknown[];
  start: unknown[];
  exchange: unknown[];
  refresh: unknown[];
};

/** 本物の Service は呼ばない。受け取った引数を記録し、応答は差し替えられる。 */
function fakePort(over: Partial<OAuthServicePort> = {}) {
  const calls: Calls = { register: [], start: [], exchange: [], refresh: [] };
  const port: OAuthServicePort = {
    register: async (input) => {
      calls.register.push(input);
      return ok({
        client_id: "c".repeat(32),
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"]
      });
    },
    startAuthorization: async (params) => {
      calls.start.push(params);
      return ok({ kind: "pending", requestId: REQUEST_ID });
    },
    exchangeCode: async (input) => {
      calls.exchange.push(input);
      return ok(TOKENS);
    },
    refresh: async (input) => {
      calls.refresh.push(input);
      return ok(TOKENS);
    },
    ...over
  };
  return { port, calls };
}

function appWith(over: Partial<OAuthServicePort> = {}) {
  const { port, calls } = fakePort(over);
  return {
    app: createApp({
      logError: () => {},
      oauth: port,
      appUrl: `${APP_URL}/`,
      accessVerifier: verify,
      isMember: async () => true
    }),
    calls
  };
}

const postJson = (
  app: ReturnType<typeof appWith>["app"],
  path: string,
  body: string,
  headers: Record<string, string> = {}
) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });

const postForm = (app: ReturnType<typeof appWith>["app"], fields: Record<string, string>) =>
  app.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  });

const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

describe("公開の OAuth ルート", () => {
  test("protected-resource は /mcp 付きでも同じ内容を返す", async () => {
    const { app } = appWith();
    const expected = {
      resource: `${APP_URL}/mcp`,
      authorization_servers: [APP_URL],
      bearer_methods_supported: ["header"]
    };
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp"
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expected);
    }
  });

  test("authorization-server の案内を返す", async () => {
    const response = await appWith().app.request("/.well-known/oauth-authorization-server");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuer: APP_URL,
      authorization_endpoint: `${APP_URL}/oauth/authorize`,
      token_endpoint: `${APP_URL}/oauth/token`,
      registration_endpoint: `${APP_URL}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true
    });
  });

  test("APP_URL が無ければ OAuth の道は載らず 404（fail closed）", async () => {
    const closed = createApp({ logError: () => {}, oauth: fakePort().port });
    for (const [path, method] of [
      ["/.well-known/oauth-protected-resource", "GET"],
      ["/.well-known/oauth-authorization-server", "GET"],
      ["/oauth/authorize", "GET"],
      ["/oauth/register", "POST"],
      ["/oauth/token", "POST"]
    ] as const) {
      const response = await closed.request(path, {
        method,
        headers: method === "POST" ? { ...ACCESS, "content-type": "application/json" } : ACCESS,
        body: method === "POST" ? "{}" : undefined
      });
      expect(response.status).toBe(404);
    }
  });

  test("register は 201 で登録した形を返す", async () => {
    const { app, calls } = appWith();
    const response = await postJson(
      app,
      "/oauth/register",
      JSON.stringify({ client_name: "架空の AI", redirect_uris: [REDIRECT] })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      client_id: "c".repeat(32),
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
    expect(calls.register).toEqual([{ client_name: "架空の AI", redirect_uris: [REDIRECT] }]);
  });

  test("register の壊れた本文は 400 invalid_client_metadata で Service を呼ばない", async () => {
    const { app, calls } = appWith();
    for (const body of ["{", "[]", "null"]) {
      const response = await postJson(app, "/oauth/register", body);
      expect(response.status).toBe(400);
      expect(await errorOf(response)).toBe("invalid_client_metadata");
    }
    expect(calls.register).toEqual([]);
  });

  test("register の検証失敗は 400 でその理由を返す", async () => {
    const { app } = appWith({ register: async () => invalid("invalid_redirect_uri") });
    const response = await postJson(
      app,
      "/oauth/register",
      JSON.stringify({ redirect_uris: ["http://example.com/cb"] })
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_redirect_uri");
  });

  const authorizeQuery = new URLSearchParams({
    response_type: "code",
    client_id: "client-1",
    redirect_uri: REDIRECT,
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
    state: "st-1",
    resource: `${APP_URL}/mcp`
  }).toString();

  test("authorize は Access の JWT が無い・不正なら 401", async () => {
    const { app, calls } = appWith();
    expect((await app.request(`/oauth/authorize?${authorizeQuery}`)).status).toBe(401);
    const broken = await app.request(`/oauth/authorize?${authorizeQuery}`, {
      headers: { "Cf-Access-Jwt-Assertion": "broken-jwt" }
    });
    expect(broken.status).toBe(401);
    expect(calls.start).toEqual([]);
  });

  test("authorize は頼みを作って許可の画面へ 302", async () => {
    const { app, calls } = appWith();
    const response = await app.request(`/oauth/authorize?${authorizeQuery}`, { headers: ACCESS });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/authorize?request=${REQUEST_ID}`);
    expect(calls.start).toEqual([
      {
        responseType: "code",
        clientId: "client-1",
        redirectUri: REDIRECT,
        codeChallenge: "c".repeat(43),
        codeChallengeMethod: "S256",
        state: "st-1",
        resource: `${APP_URL}/mcp`
      }
    ]);
  });

  test("戻り先が登録と合わない authorize は飛ばさず 400 の案内文", async () => {
    const { app } = appWith({ startAuthorization: async () => ok({ kind: "unusable" }) });
    const response = await app.request(`/oauth/authorize?${authorizeQuery}`, { headers: ACCESS });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe(
      "この AI とのつなぎ方は使えません。AI の画面から、もう一度つなぎ直してください。"
    );
  });

  test("そのほかの不正は Service が作った戻り先へ 302", async () => {
    const redirectTo = `${REDIRECT}?error=invalid_request&state=st-1&iss=${encodeURIComponent(APP_URL)}`;
    const { app } = appWith({
      startAuthorization: async () => ok({ kind: "rejected", redirectTo })
    });
    const response = await app.request(`/oauth/authorize?${authorizeQuery}`, { headers: ACCESS });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(redirectTo);
  });

  const codeFields = {
    grant_type: "authorization_code",
    code: "hkd_cd_x",
    code_verifier: "v".repeat(43),
    client_id: "client-1",
    redirect_uri: REDIRECT
  };

  test("token はコードをトークンに替え、保存させない", async () => {
    const { app, calls } = appWith();
    const response = await postForm(app, codeFields);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      access_token: "hkd_at_fake",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "hkd_rt_fake"
    });
    expect(calls.exchange).toEqual([
      {
        code: "hkd_cd_x",
        codeVerifier: "v".repeat(43),
        clientId: "client-1",
        redirectUri: REDIRECT
      }
    ]);
  });

  test("token の Service 失敗は RFC 6749 の形で返す", async () => {
    const { app } = appWith({ exchangeCode: async () => invalid("invalid_grant") });
    const response = await postForm(app, codeFields);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });

  test("token の DB 失敗は 503 temporarily_unavailable", async () => {
    for (const over of [
      { exchangeCode: async () => upstream("コードを引き換えられませんでした") },
      { refresh: async () => upstream("トークンを更新できませんでした") }
    ] as Partial<OAuthServicePort>[]) {
      const { app } = appWith(over);
      const response = await postForm(
        app,
        over.exchangeCode
          ? codeFields
          : {
              grant_type: "refresh_token",
              refresh_token: "hkd_rt_x",
              client_id: "client-1"
            }
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    }
  });

  test("register の DB 失敗は 503 temporarily_unavailable", async () => {
    const { app } = appWith({ register: async () => upstream("登録できませんでした") });
    const response = await postJson(
      app,
      "/oauth/register",
      JSON.stringify({ redirect_uris: [REDIRECT] })
    );
    expect(response.status).toBe(503);
    expect(await errorOf(response)).toBe("temporarily_unavailable");
  });

  test("token の足りない項目・grant_type 無しは invalid_request で Service を呼ばない", async () => {
    const { app, calls } = appWith();
    for (const fields of [
      { grant_type: "authorization_code", code: "x" },
      { grant_type: "refresh_token" },
      {}
    ] as Record<string, string>[]) {
      expect(await errorOf(await postForm(app, fields))).toBe("invalid_request");
    }
    expect(calls.exchange).toEqual([]);
    expect(calls.refresh).toEqual([]);
  });

  test("知らない grant_type は unsupported_grant_type", async () => {
    const response = await postForm(appWith().app, { grant_type: "password" });
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("unsupported_grant_type");
  });

  test("refresh_token は client_id と一緒に渡す", async () => {
    const { app, calls } = appWith();
    const response = await postForm(app, {
      grant_type: "refresh_token",
      refresh_token: "hkd_rt_x",
      client_id: "client-1"
    });
    expect(response.status).toBe(200);
    expect(calls.refresh).toEqual([{ refreshToken: "hkd_rt_x", clientId: "client-1" }]);
  });
});

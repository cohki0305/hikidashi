import { describe, expect, test } from "bun:test";
import type { OAuthRequestServicePort } from "@/server/api/protected/oauth-requests";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, invalid, notFound, ok } from "@/server/lib/result";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS = { "Cf-Access-Jwt-Assertion": "valid-jwt" };

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

function build(options: { port?: Partial<OAuthRequestServicePort>; withService?: boolean } = {}) {
  const calls: { approve: unknown[]; deny: string[] } = { approve: [], deny: [] };
  const port: OAuthRequestServicePort = {
    describeRequest: async () => ok({ clientName: "Claude", status: "pending" }),
    approve: async (id, email) => {
      calls.approve.push({ id, email });
      return ok({ redirectTo: "https://claude.ai/cb?code=hkd_cd_fake&state=st-1" });
    },
    deny: async (id) => {
      calls.deny.push(id);
      return ok({ redirectTo: "https://claude.ai/cb?error=access_denied&state=st-1" });
    },
    ...options.port
  };
  const app = createApp({
    logError: () => {},
    accessVerifier: verify,
    ...(options.withService === false ? {} : { oauth: port })
  });
  return { app, calls };
}

const get = (app: ReturnType<typeof build>["app"], id = REQUEST_ID) =>
  app.request(`/api/oauth-requests/${id}`, { headers: ACCESS });
const post = (
  app: ReturnType<typeof build>["app"],
  action: "approvals" | "denials",
  headers: Record<string, string> = ACCESS
) => app.request(`/api/oauth-requests/${REQUEST_ID}/${action}`, { method: "POST", headers });

describe("GET /api/oauth-requests/:id", () => {
  test("つなぐ相手の名前と状態を返す", async () => {
    const { app } = build();
    const response = await get(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clientName: "Claude", status: "pending" });
  });

  test("期限切れも状態として返す", async () => {
    const { app } = build({
      port: { describeRequest: async () => ok({ clientName: "Claude", status: "expired" }) }
    });
    expect(await (await get(app)).json()).toEqual({ clientName: "Claude", status: "expired" });
  });

  test("Access の JWT が無い・不正なら 401", async () => {
    const { app } = build();
    expect((await app.request(`/api/oauth-requests/${REQUEST_ID}`)).status).toBe(401);
    const broken = await app.request(`/api/oauth-requests/${REQUEST_ID}`, {
      headers: { "Cf-Access-Jwt-Assertion": "broken-jwt" }
    });
    expect(broken.status).toBe(401);
  });

  test("無い・期限切れの頼みは 404", async () => {
    const { app } = build({ port: { describeRequest: async () => notFound("見つかりません") } });
    expect((await get(app)).status).toBe(404);
  });

  test("uuid でない id は 404", async () => {
    const { app } = build();
    expect((await get(app, "abc")).status).toBe(404);
  });

  test("Service が無ければ 404 で塞ぐ（fail closed）", async () => {
    const { app } = build({ withService: false });
    expect((await get(app)).status).toBe(404);
  });
});

describe("POST /api/oauth-requests/:id/approvals", () => {
  test("ログイン中のメールアドレスで許可し、戻り先を返す", async () => {
    const { app, calls } = build();
    const response = await post(app, "approvals");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirectTo: "https://claude.ai/cb?code=hkd_cd_fake&state=st-1"
    });
    expect(calls.approve).toEqual([{ id: REQUEST_ID, email: "member@example.com" }]);
  });

  test("Access の JWT が無ければ 401", async () => {
    const { app, calls } = build();
    expect((await post(app, "approvals", {})).status).toBe(401);
    expect(calls.approve).toEqual([]);
  });

  test("期限切れの頼みは 400", async () => {
    const { app } = build({
      port: {
        approve: async () =>
          invalid("この画面は期限が切れました。Claude の画面からもう一度つないでください。")
      }
    });
    expect((await post(app, "approvals")).status).toBe(400);
  });
});

describe("POST /api/oauth-requests/:id/denials", () => {
  test("やめると access_denied の戻り先を返す", async () => {
    const { app, calls } = build();
    const response = await post(app, "denials");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirectTo: "https://claude.ai/cb?error=access_denied&state=st-1"
    });
    expect(calls.deny).toEqual([REQUEST_ID]);
  });
});

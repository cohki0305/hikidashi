import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { oauthAccessTokens, oauthClients, oauthGrants, oauthRequests } from "@/server/db/schema";
import type { Result } from "@/server/lib/result";
import { OauthAccessTokenRepository } from "@/server/repositories/oauth-access-token-repository";
import { OauthClientRepository } from "@/server/repositories/oauth-client-repository";
import { OauthGrantRepository } from "@/server/repositories/oauth-grant-repository";
import { OauthRequestRepository } from "@/server/repositories/oauth-request-repository";
import { OauthUsedRefreshTokenRepository } from "@/server/repositories/oauth-used-refresh-token-repository";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthService } from "./index";

// RFC 7636 付録 B の組
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const ISSUER = "https://hikidashi.example.test";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const openDbs: TestDb[] = [];

type Harness = {
  db: SkillDb;
  service: OauthService;
  advance: (ms: number) => void;
};

function setup(): Harness {
  const testDb = createTestDb();
  openDbs.push(testDb);
  let clock = new Date("2026-10-20T00:00:00.000Z");
  const service = new OauthService({
    db: testDb.db,
    clients: new OauthClientRepository(testDb.db),
    requests: new OauthRequestRepository(testDb.db),
    grants: new OauthGrantRepository(testDb.db),
    accessTokens: new OauthAccessTokenRepository(testDb.db),
    usedRefreshTokens: new OauthUsedRefreshTokenRepository(testDb.db),
    issuer: ISSUER,
    now: () => clock
  });
  return {
    db: testDb.db,
    service,
    advance: (ms) => {
      clock = new Date(clock.getTime() + ms);
    }
  };
}

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function expectInvalidGrant(result: Result<unknown>) {
  expect(result).toMatchObject({ ok: false, kind: "invalid", message: "invalid_grant" });
}

async function registerClient(service: OauthService) {
  return must(
    await service.register({
      client_name: "Claude",
      redirect_uris: [REDIRECT]
    })
  );
}

async function startRequest(service: OauthService, clientId: string, redirectUri = REDIRECT) {
  const started = must(
    await service.startAuthorization({
      responseType: "code",
      clientId,
      redirectUri,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: "S256",
      state: "st-1"
    })
  );
  if (started.kind !== "pending") throw new Error(`pending ではありません: ${started.kind}`);
  return started.requestId;
}

async function allowed(service: OauthService) {
  const client = await registerClient(service);
  const requestId = await startRequest(service, client.client_id);
  const { redirectTo } = must(await service.approve(requestId, "hanako@example.test"));
  const code = new URL(redirectTo).searchParams.get("code") ?? "";
  return { clientId: client.client_id, requestId, redirectTo, code };
}

function exchange(
  service: OauthService,
  code: string,
  clientId: string,
  over: { codeVerifier?: string; redirectUri?: string } = {}
) {
  return service.exchangeCode({
    code,
    codeVerifier: over.codeVerifier ?? VERIFIER,
    clientId,
    redirectUri: over.redirectUri ?? REDIRECT
  });
}

const dumps = async (db: SkillDb) =>
  JSON.stringify([
    await db.select().from(oauthRequests),
    await db.select().from(oauthGrants),
    await db.select().from(oauthAccessTokens)
  ]);

describe("OauthService", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  describe("register", () => {
    test("登録した形を返し、名前が無ければ Claude にする", async () => {
      const { service } = setup();
      const client = must(await service.register({ redirect_uris: [REDIRECT] }));
      expect(client.client_id).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(client.client_name).toBe("Claude");
      expect(client.redirect_uris).toEqual([REDIRECT]);
      expect(client.token_endpoint_auth_method).toBe("none");
      expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
      expect(client.response_types).toEqual(["code"]);
    });

    test("戻り先が 6 件・http の一般のドメイン・0 件は invalid_redirect_uri", async () => {
      const { service, db } = setup();
      for (const redirectUris of [
        Array.from({ length: 6 }, (_, index) => `https://a${index}.example.test/cb`),
        ["http://example.com/cb"],
        [],
        [REDIRECT, "javascript:alert(1)"]
      ]) {
        expect(await service.register({ redirect_uris: redirectUris })).toMatchObject({
          ok: false,
          kind: "invalid",
          message: "invalid_redirect_uri"
        });
      }
      expect(await db.select().from(oauthClients)).toHaveLength(0);
    });
  });

  describe("startAuthorization", () => {
    test("登録と完全一致しない戻り先へは飛ばさない（unusable）", async () => {
      const { service, db } = setup();
      const client = await registerClient(service);
      for (const input of [
        { clientId: "unknown", redirectUri: REDIRECT },
        { clientId: client.client_id, redirectUri: "https://claude.ai/other" },
        { clientId: client.client_id, redirectUri: undefined },
        { clientId: undefined, redirectUri: REDIRECT }
      ]) {
        expect(
          must(
            await service.startAuthorization({
              responseType: "code",
              codeChallenge: CHALLENGE,
              codeChallengeMethod: "S256",
              state: "st-1",
              ...input
            })
          )
        ).toEqual({ kind: "unusable" });
      }
      expect(await db.select().from(oauthRequests)).toHaveLength(0);
    });

    test("code 以外・S256 以外は戻り先へ invalid_request と state・iss を返す", async () => {
      const { service, db } = setup();
      const client = await registerClient(service);
      for (const over of [
        { responseType: "token" },
        { codeChallenge: undefined },
        { codeChallenge: "short" },
        { codeChallengeMethod: "plain" },
        { codeChallengeMethod: undefined }
      ]) {
        const started = must(
          await service.startAuthorization({
            responseType: "code",
            clientId: client.client_id,
            redirectUri: REDIRECT,
            codeChallenge: CHALLENGE,
            codeChallengeMethod: "S256",
            state: "st-1",
            ...over
          })
        );
        if (started.kind !== "rejected") throw new Error("rejected になるはず");
        const url = new URL(started.redirectTo);
        expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
        expect(url.searchParams.get("error")).toBe("invalid_request");
        expect(url.searchParams.get("state")).toBe("st-1");
        expect(url.searchParams.get("iss")).toBe(ISSUER);
      }
      expect(await db.select().from(oauthRequests)).toHaveLength(0);
    });

    test("正しい頼みは pending で、期限は 10 分", async () => {
      const { service, db } = setup();
      const client = await registerClient(service);
      const requestId = await startRequest(service, client.client_id);
      const row = (await db.select().from(oauthRequests))[0];
      expect(row?.id).toBe(requestId);
      expect(row?.expiresAt).toBe("2026-10-20T00:10:00.000Z");
      expect(row?.state).toBe("st-1");
    });
  });

  describe("describeRequest・approve・deny", () => {
    test("許可するとコード・state・iss を付けて戻し、describeRequest は pending", async () => {
      const { service } = setup();
      const { requestId, redirectTo } = await allowed(service);
      const url = new URL(redirectTo);
      expect(url.searchParams.get("code")).toStartWith("hkd_cd_");
      expect(url.searchParams.get("state")).toBe("st-1");
      expect(url.searchParams.get("iss")).toBe(ISSUER);
      expect(must(await service.describeRequest(requestId))).toEqual({
        clientName: "Claude",
        status: "pending"
      });
    });

    test("期限切れの頼みは describeRequest が expired で、許可もできない", async () => {
      const { service, advance } = setup();
      const client = await registerClient(service);
      const requestId = await startRequest(service, client.client_id);
      advance(10 * MINUTE_MS + 1);

      expect(must(await service.describeRequest(requestId))).toEqual({
        clientName: "Claude",
        status: "expired"
      });
      expect(await service.approve(requestId, "hanako@example.test")).toMatchObject({
        ok: false
      });
    });

    test("使い済みの頼みはもう許可できず、describeRequest は expired", async () => {
      const { service } = setup();
      const { requestId, code, clientId } = await allowed(service);
      must(await exchange(service, code, clientId));

      expect(await service.approve(requestId, "other@example.test")).toMatchObject({
        ok: false
      });
      expect(must(await service.describeRequest(requestId))).toEqual({
        clientName: "Claude",
        status: "expired"
      });
    });

    test("やめると access_denied・state・iss を返し、そのあとは許可できない", async () => {
      const { service, db } = setup();
      const client = await registerClient(service);
      const requestId = await startRequest(service, client.client_id);
      const { redirectTo } = must(await service.deny(requestId));
      const url = new URL(redirectTo);
      expect(url.searchParams.get("error")).toBe("access_denied");
      expect(url.searchParams.get("state")).toBe("st-1");
      expect(url.searchParams.get("iss")).toBe(ISSUER);
      expect(await service.approve(requestId, "hanako@example.test")).toMatchObject({
        ok: false
      });
      expect(must(await service.describeRequest(requestId)).status).toBe("expired");
      expect(await db.select().from(oauthGrants)).toHaveLength(0);
    });

    test("知らない頼みは not_found", async () => {
      const { service } = setup();
      expect(await service.describeRequest("missing")).toMatchObject({
        ok: false,
        kind: "not_found"
      });
      expect(await service.approve("missing", "hanako@example.test")).toMatchObject({
        ok: false,
        kind: "not_found"
      });
      expect(await service.deny("missing")).toMatchObject({ ok: false, kind: "not_found" });
    });
  });

  describe("exchangeCode", () => {
    test("正しい verifier でトークンを出し、access でメールを取れる", async () => {
      const { service } = setup();
      const { code, clientId } = await allowed(service);
      const tokens = must(await exchange(service, code, clientId));
      expect(tokens.accessToken).toStartWith("hkd_at_");
      expect(tokens.refreshToken).toStartWith("hkd_rt_");
      expect(tokens.expiresIn).toBe(3600);
      expect(await service.authenticate(tokens.accessToken)).toEqual({
        email: "hanako@example.test"
      });
    });

    test("DB にコード・トークンの平文を残さない", async () => {
      const { service, db } = setup();
      const { code, clientId } = await allowed(service);
      const tokens = must(await exchange(service, code, clientId));
      const dump = await dumps(db);
      for (const secret of [code, tokens.accessToken, tokens.refreshToken])
        expect(dump).not.toContain(secret);
      for (const secret of [code, tokens.accessToken, tokens.refreshToken])
        expect(dump).not.toContain(secret.slice("hkd_xx_".length));
    });

    test("違う verifier・別の client_id・別の戻り先は invalid_grant", async () => {
      for (const over of [
        { codeVerifier: `${VERIFIER.slice(1)}a` },
        { clientId: "other-client" },
        { redirectUri: "https://claude.ai/api/mcp/other" }
      ] as { codeVerifier?: string; clientId?: string; redirectUri?: string }[]) {
        const { service } = setup();
        const { code, clientId } = await allowed(service);
        expectInvalidGrant(await exchange(service, code, over.clientId ?? clientId, over));
      }
    });

    test("知らないコード・期限切れのコードは invalid_grant", async () => {
      const { service, advance } = setup();
      const client = await registerClient(service);
      expectInvalidGrant(await exchange(service, "hkd_cd_unknown", client.client_id));

      const { code, clientId } = await allowed(service);
      advance(10 * MINUTE_MS + 1);
      expectInvalidGrant(await exchange(service, code, clientId));
    });

    test("2 回目の引き換えは invalid_grant", async () => {
      const { service } = setup();
      const { code, clientId } = await allowed(service);
      must(await exchange(service, code, clientId));
      expectInvalidGrant(await exchange(service, code, clientId));
    });

    test("同じコードを同時に 2 回出しても成功は 1 回だけ", async () => {
      const { service } = setup();
      const { code, clientId } = await allowed(service);
      const results = await Promise.all([
        exchange(service, code, clientId),
        exchange(service, code, clientId)
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toHaveLength(1);
    });
  });

  describe("refresh", () => {
    test("回転で新旧が入れ替わり、古いアクセストークンは期限まで使える", async () => {
      const { service } = setup();
      const { code, clientId } = await allowed(service);
      const first = must(await exchange(service, code, clientId));
      const second = must(await service.refresh({ refreshToken: first.refreshToken, clientId }));

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.accessToken).not.toBe(first.accessToken);
      expect(await service.authenticate(second.accessToken)).not.toBeNull();
      expect(await service.authenticate(first.accessToken)).not.toBeNull();
    });

    test("使い終わった refresh がもう一度来たら grant を取り消し、access も 401 になる", async () => {
      const { service } = setup();
      const { code, clientId } = await allowed(service);
      const first = must(await exchange(service, code, clientId));
      const second = must(await service.refresh({ refreshToken: first.refreshToken, clientId }));

      expectInvalidGrant(await service.refresh({ refreshToken: first.refreshToken, clientId }));

      expect(await service.authenticate(second.accessToken)).toBeNull();
      expect(await service.authenticate(first.accessToken)).toBeNull();
      expectInvalidGrant(await service.refresh({ refreshToken: second.refreshToken, clientId }));
    });

    test("別の client_id・知らない値・30 日を過ぎた値は invalid_grant", async () => {
      const { service, advance } = setup();
      const { code, clientId } = await allowed(service);
      const tokens = must(await exchange(service, code, clientId));

      expectInvalidGrant(
        await service.refresh({ refreshToken: tokens.refreshToken, clientId: "other-client" })
      );
      expectInvalidGrant(await service.refresh({ refreshToken: "hkd_rt_unknown", clientId }));

      advance(30 * DAY_MS + 1);
      expectInvalidGrant(await service.refresh({ refreshToken: tokens.refreshToken, clientId }));
    });
  });

  describe("authenticate", () => {
    test("知らない値と、1 時間を過ぎた access は null", async () => {
      const { service, advance } = setup();
      const { code, clientId } = await allowed(service);
      const tokens = must(await exchange(service, code, clientId));

      expect(await service.authenticate("hkd_at_unknown")).toBeNull();
      advance(60 * MINUTE_MS + 1);
      expect(await service.authenticate(tokens.accessToken)).toBeNull();
    });
  });
});

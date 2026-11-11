import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import {
  oauthAccessTokens,
  oauthClients,
  oauthGrants,
  oauthRequests,
  oauthUsedRefreshTokens
} from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthClientRepository } from "./index";

const NOW = "2026-10-20T00:00:00.000Z";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: OauthClientRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new OauthClientRepository(testDb.db) };
}

describe("OauthClientRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("作って id で引ける。戻り先は配列のまま返る", async () => {
    const { repository } = setup();

    const created = await repository.create({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT]
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT]
    });

    expect(await repository.findById("client-1")).toEqual({
      ok: true,
      value: {
        id: "client-1",
        clientName: "架空の Claude",
        redirectUris: [REDIRECT]
      }
    });
    expect(await repository.findById("missing")).toEqual({ ok: true, value: null });
  });

  test("連携するアプリを消すと、頼み・つながり・トークンも一緒に消える", async () => {
    const { db, repository } = setup();
    await repository.create({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT]
    });
    await db
      .insert(oauthRequests)
      .values({
        id: "request-1",
        clientId: "client-1",
        redirectUri: REDIRECT,
        state: null,
        codeChallenge: "c".repeat(43),
        resource: null,
        expiresAt: "2026-10-20T00:10:00.000Z"
      })
      .run();
    await db
      .insert(oauthGrants)
      .values({
        id: "grant-1",
        email: "hanako@example.test",
        clientId: "client-1",
        refreshTokenHash: "r".repeat(64),
        refreshExpiresAt: "2026-11-20T00:00:00.000Z",
        createdAt: NOW
      })
      .run();
    await db
      .insert(oauthAccessTokens)
      .values({
        tokenHash: "a".repeat(64),
        grantId: "grant-1",
        expiresAt: "2026-10-20T01:00:00.000Z"
      })
      .run();
    await db
      .insert(oauthUsedRefreshTokens)
      .values({ tokenHash: "u".repeat(64), grantId: "grant-1", usedAt: NOW })
      .run();

    await db.delete(oauthClients).run();

    expect(await db.select().from(oauthClients).all()).toEqual([]);
    expect(await db.select().from(oauthRequests).all()).toEqual([]);
    expect(await db.select().from(oauthGrants).all()).toEqual([]);
    expect(await db.select().from(oauthAccessTokens).all()).toEqual([]);
    expect(await db.select().from(oauthUsedRefreshTokens).all()).toEqual([]);
  });
});

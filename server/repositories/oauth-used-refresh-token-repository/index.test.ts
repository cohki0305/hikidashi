import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { oauthClients, oauthGrants, oauthUsedRefreshTokens } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthUsedRefreshTokenRepository } from "./index";

const NOW = "2026-10-20T00:00:00.000Z";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: OauthUsedRefreshTokenRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new OauthUsedRefreshTokenRepository(testDb.db) };
}

async function seedGrant(db: SkillDb) {
  await db
    .insert(oauthClients)
    .values({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT],
      createdAt: NOW
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
}

describe("OauthUsedRefreshTokenRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("使い終わった hash から grant を引ける。無ければ null", async () => {
    const { db, repository } = setup();
    await seedGrant(db);
    await db
      .insert(oauthUsedRefreshTokens)
      .values({ tokenHash: "u".repeat(64), grantId: "grant-1", usedAt: NOW })
      .run();

    expect(await repository.findGrantId("u".repeat(64))).toEqual({ ok: true, value: "grant-1" });
    expect(await repository.findGrantId("z".repeat(64))).toEqual({ ok: true, value: null });
  });
});

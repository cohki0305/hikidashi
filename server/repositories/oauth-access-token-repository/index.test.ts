import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { oauthClients } from "@/server/db/schema";
import { OauthGrantRepository } from "@/server/repositories/oauth-grant-repository";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthAccessTokenRepository } from "./index";

const NOW = "2026-10-20T00:00:00.000Z";
const TOKEN_EXPIRES = "2026-10-20T01:00:00.000Z";
const REFRESH_EXPIRES = "2026-11-20T00:00:00.000Z";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const TOKEN_HASH = "t".repeat(64);
const openDbs: TestDb[] = [];

function setup(): {
  db: SkillDb;
  repository: OauthAccessTokenRepository;
  grants: OauthGrantRepository;
} {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return {
    db: testDb.db,
    repository: new OauthAccessTokenRepository(testDb.db),
    grants: new OauthGrantRepository(testDb.db)
  };
}

async function seedGrant(db: SkillDb, grants: OauthGrantRepository) {
  await db
    .insert(oauthClients)
    .values({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT],
      createdAt: NOW
    })
    .run();
  const created = await grants.create({
    id: "grant-1",
    email: "hanako@example.test",
    clientId: "client-1",
    refreshTokenHash: "r".repeat(64),
    refreshExpiresAt: REFRESH_EXPIRES,
    createdAt: NOW
  });
  expect(created.ok).toBe(true);
}

describe("OauthAccessTokenRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("期限内で grant が生きているトークンだけ引ける", async () => {
    const { db, repository, grants } = setup();
    await seedGrant(db, grants);

    expect(
      await repository.create({
        tokenHash: TOKEN_HASH,
        grantId: "grant-1",
        expiresAt: TOKEN_EXPIRES
      })
    ).toEqual({ ok: true, value: undefined });

    expect(await repository.findLive(TOKEN_HASH, NOW)).toEqual({
      ok: true,
      value: { grantId: "grant-1", email: "hanako@example.test" }
    });
    expect(await repository.findLive(TOKEN_HASH, "2026-10-20T02:00:00.000Z")).toEqual({
      ok: true,
      value: null
    });
    expect(await repository.findLive("z".repeat(64), NOW)).toEqual({ ok: true, value: null });
  });

  test("取り消した grant のトークンは引けない", async () => {
    const { db, repository, grants } = setup();
    await seedGrant(db, grants);
    await repository.create({
      tokenHash: TOKEN_HASH,
      grantId: "grant-1",
      expiresAt: TOKEN_EXPIRES
    });

    await grants.revoke("grant-1", NOW);

    expect(await repository.findLive(TOKEN_HASH, NOW)).toEqual({ ok: true, value: null });
  });
});

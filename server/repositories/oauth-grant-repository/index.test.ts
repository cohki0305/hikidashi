import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { oauthClients } from "@/server/db/schema";
import { OauthUsedRefreshTokenRepository } from "@/server/repositories/oauth-used-refresh-token-repository";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthGrantRepository } from "./index";

const NOW = "2026-10-20T00:00:00.000Z";
const EXPIRES = "2026-11-20T00:00:00.000Z";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const OLD_HASH = "a".repeat(64);
const NEW_HASH = "b".repeat(64);
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: OauthGrantRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new OauthGrantRepository(testDb.db) };
}

async function seedClient(db: SkillDb) {
  await db
    .insert(oauthClients)
    .values({
      id: "client-1",
      clientName: "架空の Claude",
      redirectUris: [REDIRECT],
      createdAt: NOW
    })
    .run();
}

async function seedGrant(repository: OauthGrantRepository, id: string, refreshTokenHash: string) {
  const created = await repository.create({
    id,
    email: "hanako@example.test",
    clientId: "client-1",
    refreshTokenHash,
    refreshExpiresAt: EXPIRES,
    createdAt: NOW
  });
  expect(created.ok).toBe(true);
}

describe("OauthGrantRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("作って id と refresh の hash で引ける", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedGrant(repository, "grant-1", OLD_HASH);

    const byId = await repository.findById("grant-1");
    expect(byId.ok).toBe(true);
    if (!byId.ok) return;
    expect(byId.value).toMatchObject({
      id: "grant-1",
      email: "hanako@example.test",
      clientId: "client-1",
      refreshTokenHash: OLD_HASH,
      revokedAt: null
    });

    const byHash = await repository.findByRefreshHash(OLD_HASH);
    expect(byHash.ok).toBe(true);
    if (!byHash.ok) return;
    expect(byHash.value?.id).toBe("grant-1");
    expect(await repository.findByRefreshHash("z".repeat(64))).toEqual({ ok: true, value: null });
  });

  test("refresh を回すと hash が入れ替わり、古い値は使い済みとして残る", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedGrant(repository, "grant-1", OLD_HASH);

    const rotated = await repository.rotateRefresh("grant-1", {
      oldHash: OLD_HASH,
      newHash: NEW_HASH,
      refreshExpiresAt: "2026-12-20T00:00:00.000Z",
      now: NOW
    });
    expect(rotated).toEqual({ ok: true, value: true });

    const row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok || !row.value) return;
    expect(row.value).toMatchObject({
      refreshTokenHash: NEW_HASH,
      refreshExpiresAt: "2026-12-20T00:00:00.000Z"
    });
    expect(await new OauthUsedRefreshTokenRepository(db).findGrantId(OLD_HASH)).toEqual({
      ok: true,
      value: "grant-1"
    });
  });

  test("古い hash が一致しないと回せず、何も変えない", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedGrant(repository, "grant-1", OLD_HASH);

    const rotated = await repository.rotateRefresh("grant-1", {
      oldHash: "x".repeat(64),
      newHash: NEW_HASH,
      refreshExpiresAt: "2026-12-20T00:00:00.000Z",
      now: NOW
    });
    expect(rotated).toEqual({ ok: true, value: false });

    const row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok || !row.value) return;
    expect(row.value).toMatchObject({ refreshTokenHash: OLD_HASH, refreshExpiresAt: EXPIRES });
    expect(await new OauthUsedRefreshTokenRepository(db).findGrantId("x".repeat(64))).toEqual({
      ok: true,
      value: null
    });
    expect(await new OauthUsedRefreshTokenRepository(db).findGrantId(NEW_HASH)).toEqual({
      ok: true,
      value: null
    });
  });

  test("取り消すと revoked_at が入る", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedGrant(repository, "grant-1", OLD_HASH);

    expect(await repository.revoke("grant-1", NOW)).toEqual({ ok: true, value: undefined });

    const row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.value?.revokedAt).toBe(NOW);
  });

  test("最後に使った日時は 5 分たってからだけ書き換える", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedGrant(repository, "grant-1", OLD_HASH);

    await repository.touch("grant-1", NOW);
    let row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.value?.lastUsedAt).toBe(NOW);

    await repository.touch("grant-1", "2026-10-20T00:01:00.000Z");
    row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.value?.lastUsedAt).toBe(NOW);

    await repository.touch("grant-1", "2026-10-20T00:06:00.000Z");
    row = await repository.findById("grant-1");
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.value?.lastUsedAt).toBe("2026-10-20T00:06:00.000Z");
  });
});

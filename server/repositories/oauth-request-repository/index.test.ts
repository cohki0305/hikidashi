import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { oauthClients, oauthRequests } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { OauthRequestRepository } from "./index";

const NOW = "2026-10-20T00:00:00.000Z";
const EXPIRES = "2026-10-20T00:10:00.000Z";
const EXPIRED = "2026-10-19T23:59:59.000Z";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CODE_HASH = "a".repeat(64);
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: OauthRequestRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new OauthRequestRepository(testDb.db) };
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

async function seedRequest(repository: OauthRequestRepository, id: string, expiresAt: string) {
  const created = await repository.create({
    id,
    clientId: "client-1",
    redirectUri: REDIRECT,
    state: "state-1",
    codeChallenge: "c".repeat(43),
    resource: null,
    expiresAt
  });
  expect(created.ok).toBe(true);
}

describe("OauthRequestRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("作って id で引ける", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedRequest(repository, "request-1", EXPIRES);

    const found = await repository.findById("request-1");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      id: "request-1",
      clientId: "client-1",
      redirectUri: REDIRECT,
      state: "state-1",
      expiresAt: EXPIRES,
      email: null,
      codeHash: null
    });
    expect(await repository.findById("missing")).toEqual({ ok: true, value: null });
  });

  test("許可は期限内の未処理だけ 1 回成功し、コードは 1 回だけ引き換えられる", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedRequest(repository, "request-1", EXPIRES);

    expect(
      await repository.approve(
        "request-1",
        { email: "hanako@example.test", codeHash: CODE_HASH },
        NOW
      )
    ).toEqual({
      ok: true,
      value: true
    });
    const approved = await repository.findById("request-1");
    expect(approved.ok).toBe(true);
    if (!approved.ok || !approved.value) return;
    expect(approved.value).toMatchObject({ email: "hanako@example.test", codeHash: CODE_HASH });

    expect(
      await repository.approve(
        "request-1",
        { email: "other@example.test", codeHash: "b".repeat(64) },
        NOW
      )
    ).toEqual({ ok: true, value: false });

    const consumed = await repository.consumeCode(CODE_HASH, NOW);
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(consumed.value).toMatchObject({ id: "request-1", usedAt: NOW });
    expect(await repository.consumeCode(CODE_HASH, NOW)).toEqual({ ok: true, value: null });
  });

  test("期限が切れた頼みは許可できない", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedRequest(repository, "request-1", EXPIRED);

    expect(
      await repository.approve(
        "request-1",
        { email: "hanako@example.test", codeHash: CODE_HASH },
        NOW
      )
    ).toEqual({ ok: true, value: false });
  });

  test("やめた頼みは許可できず、2 回目もやめられない", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedRequest(repository, "request-1", EXPIRES);

    expect(await repository.markDenied("request-1", NOW)).toEqual({ ok: true, value: true });
    expect(await repository.markDenied("request-1", NOW)).toEqual({ ok: true, value: false });
    expect(
      await repository.approve(
        "request-1",
        { email: "hanako@example.test", codeHash: CODE_HASH },
        NOW
      )
    ).toEqual({ ok: true, value: false });
  });

  test("許可済みの頼みはやめられない", async () => {
    const { db, repository } = setup();
    await seedClient(db);
    await seedRequest(repository, "request-1", EXPIRES);
    await repository.approve(
      "request-1",
      { email: "hanako@example.test", codeHash: CODE_HASH },
      NOW
    );

    expect(await repository.markDenied("request-1", NOW)).toEqual({ ok: true, value: false });
    expect(await db.select().from(oauthRequests).all()).toHaveLength(1);
  });
});

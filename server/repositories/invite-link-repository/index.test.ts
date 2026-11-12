import { afterEach, describe, expect, test } from "bun:test";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { type InviteLink, InviteLinkRepository } from "./index";

const NOW = "2026-11-01T00:00:00.000Z";
const LATER = "2026-11-02T00:00:00.000Z";
const EXPIRES = "2026-11-08T00:00:00.000Z";
const openDbs: TestDb[] = [];

function setup(): { repository: InviteLinkRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { repository: new InviteLinkRepository(testDb.db) };
}

function inviteLink(id: string, createdBy: string, createdAt = NOW): InviteLink {
  return {
    id,
    keyHash: ("0".repeat(64) + id).slice(-64),
    createdBy,
    createdAt,
    expiresAt: EXPIRES,
    revokedAt: null
  };
}

describe("InviteLinkRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("作ったリンクを鍵の hash で引ける", async () => {
    const { repository } = setup();
    const row = inviteLink("invite-1", "owner@example.test");
    await repository.create(row);

    const found = await repository.findByKeyHash(row.keyHash);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      id: "invite-1",
      keyHash: row.keyHash,
      createdBy: "owner@example.test",
      revokedAt: null
    });
  });

  test("知らない鍵の hash なら null", async () => {
    const { repository } = setup();

    expect(await repository.findByKeyHash("z".repeat(64))).toEqual({ ok: true, value: null });
  });

  test("作った人ごとに新しい順で返す", async () => {
    const { repository } = setup();
    await repository.create(inviteLink("invite-1", "owner@example.test", NOW));
    await repository.create(inviteLink("invite-2", "owner@example.test", LATER));
    await repository.create(inviteLink("invite-3", "other@example.test", LATER));

    const listed = await repository.listByCreator("owner@example.test");
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((link) => link.id)).toEqual(["invite-2", "invite-1"]);
  });

  test("取り消すと 2 回目は false になり、日時は最初のまま", async () => {
    const { repository } = setup();
    const row = inviteLink("invite-1", "owner@example.test");
    await repository.create(row);

    expect(await repository.revoke({ id: "invite-1", revokedAt: NOW })).toEqual({
      ok: true,
      value: true
    });
    expect(await repository.revoke({ id: "invite-1", revokedAt: LATER })).toEqual({
      ok: true,
      value: false
    });

    const found = await repository.findByKeyHash(row.keyHash);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.revokedAt).toBe(NOW);
  });
});

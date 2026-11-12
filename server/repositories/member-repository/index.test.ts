import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { inviteLinks } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { MemberRepository } from "./index";

const NOW = "2026-11-01T00:00:00.000Z";
const LATER = "2026-11-02T00:00:00.000Z";
const KEY_HASH = "a".repeat(64);
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: MemberRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new MemberRepository(testDb.db) };
}

async function seedInviteLink(db: SkillDb, id: string) {
  await db
    .insert(inviteLinks)
    .values({
      id,
      keyHash: KEY_HASH,
      createdBy: "owner@example.test",
      createdAt: NOW,
      expiresAt: "2026-11-08T00:00:00.000Z"
    })
    .run();
}

describe("MemberRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("参加した人を保存し、メールで引ける", async () => {
    const { repository } = setup();

    expect(
      await repository.upsertJoined({
        email: "hanako@example.test",
        joinedAt: NOW,
        inviteLinkId: null
      })
    ).toEqual({ ok: true, value: undefined });

    const found = await repository.find("hanako@example.test");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      email: "hanako@example.test",
      joinedAt: NOW,
      inviteLinkId: null,
      removedAt: null,
      removedBy: null
    });
  });

  test("メールは小文字にそろえて保存・比較する", async () => {
    const { repository } = setup();

    await repository.upsertJoined({
      email: "Hanako@Example.Test",
      joinedAt: NOW,
      inviteLinkId: null
    });

    const found = await repository.find("HANAKO@example.TEST");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.email).toBe("hanako@example.test");
  });

  test("外された人が同じメールで参加し直すと有効に戻る", async () => {
    const { db, repository } = setup();
    await seedInviteLink(db, "invite-1");
    await repository.upsertJoined({
      email: "hanako@example.test",
      joinedAt: NOW,
      inviteLinkId: "invite-1"
    });

    const removed = await repository.markRemoved({
      email: "hanako@example.test",
      removedAt: NOW,
      removedBy: "owner@example.test"
    });
    expect(removed).toEqual({ ok: true, value: true });

    await repository.upsertJoined({
      email: "hanako@example.test",
      joinedAt: LATER,
      inviteLinkId: "invite-1"
    });

    const found = await repository.find("hanako@example.test");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      email: "hanako@example.test",
      joinedAt: LATER,
      inviteLinkId: "invite-1",
      removedAt: null,
      removedBy: null
    });
  });

  test("同じ人を 2 回外すと 2 回目は false", async () => {
    const { repository } = setup();
    await repository.upsertJoined({
      email: "hanako@example.test",
      joinedAt: NOW,
      inviteLinkId: null
    });

    expect(
      await repository.markRemoved({
        email: "hanako@example.test",
        removedAt: NOW,
        removedBy: "owner@example.test"
      })
    ).toEqual({ ok: true, value: true });

    expect(
      await repository.markRemoved({
        email: "hanako@example.test",
        removedAt: LATER,
        removedBy: "owner@example.test"
      })
    ).toEqual({ ok: true, value: false });

    const found = await repository.find("hanako@example.test");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.removedAt).toBe(NOW);
  });

  test("有効な人だけを並べる", async () => {
    const { repository } = setup();
    await repository.upsertJoined({
      email: "hanako@example.test",
      joinedAt: NOW,
      inviteLinkId: null
    });
    await repository.upsertJoined({
      email: "taro@example.test",
      joinedAt: LATER,
      inviteLinkId: null
    });
    await repository.markRemoved({
      email: "hanako@example.test",
      removedAt: LATER,
      removedBy: "owner@example.test"
    });

    const active = await repository.listActive();
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.value.map((member) => member.email)).toEqual(["taro@example.test"]);
  });
});

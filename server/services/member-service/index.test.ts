import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { inviteLinks, members } from "@/server/db/schema";
import { hashToken } from "@/server/lib/oauth/token";
import { ok, type Result, upstream } from "@/server/lib/result";
import { InviteLinkRepository } from "@/server/repositories/invite-link-repository";
import { MemberRepository } from "@/server/repositories/member-repository";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { MemberService } from "./index";

const OWNER = "owner@example.test";
const NOW = new Date("2026-11-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = "https://hikidashi.example.test";
const INVALID_LINK = {
  ok: false,
  kind: "invalid",
  message: "このリンクは使えません"
} as const;
const openDbs: TestDb[] = [];

function setup(options: { ownerEmails?: string[]; revokeResult?: Result<void> } = {}): {
  db: SkillDb;
  service: MemberService;
  revoked: string[];
  setClock: (date: Date) => void;
} {
  const testDb = createTestDb();
  openDbs.push(testDb);
  let clock = NOW;
  let serial = 0;
  const revoked: string[] = [];
  const service = new MemberService({
    members: new MemberRepository(testDb.db),
    inviteLinks: new InviteLinkRepository(testDb.db),
    revokeGrantsFor: async (email) => {
      revoked.push(email);
      return options.revokeResult ?? ok(undefined);
    },
    ownerEmails: options.ownerEmails ?? [OWNER],
    now: () => clock,
    randomKey: () => `hkd_iv_test${String(++serial).padStart(3, "0")}`,
    appUrl: APP_URL
  });
  return {
    db: testDb.db,
    service,
    revoked,
    setClock: (date) => {
      clock = date;
    }
  };
}

function keyOf(url: string): string {
  return new URL(url).searchParams.get("key") ?? "";
}

async function createInvite(service: MemberService, byEmail = OWNER) {
  const created = await service.createInvite(byEmail);
  if (!created.ok) throw new Error(created.message);
  return created.value;
}

async function joinedMember(service: MemberService, email: string): Promise<string> {
  const invite = await createInvite(service);
  const redeemed = await service.redeem(email, keyOf(invite.url));
  if (!redeemed.ok) throw new Error(redeemed.message);
  return invite.id;
}

async function memberRow(db: SkillDb, email: string) {
  return await db.select().from(members).where(eq(members.email, email)).get();
}

describe("MemberService.isMember", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("オーナーは members に行が無くても大文字小文字を問わずメンバー", async () => {
    const { service } = setup();

    expect(await service.isMember(OWNER)).toBe(true);
    expect(await service.isMember("OWNER@Example.TEST")).toBe(true);
  });

  test("有効なメンバーはメンバー、外した人と知らない人はメンバーでない", async () => {
    const { db, service } = setup();
    await joinedMember(service, "hanako@example.test");

    expect(await service.isMember("HANAKO@example.test")).toBe(true);

    await new MemberRepository(db).markRemoved({
      email: "hanako@example.test",
      removedAt: NOW.toISOString(),
      removedBy: OWNER
    });

    expect(await service.isMember("hanako@example.test")).toBe(false);
    expect(await service.isMember("nobody@example.test")).toBe(false);
  });

  test("オーナーもメンバーも居なければ誰もメンバーでない（fail closed）", async () => {
    const { service } = setup({ ownerEmails: [] });

    expect(await service.isMember(OWNER)).toBe(false);
    expect(await service.isMember("hanako@example.test")).toBe(false);
  });
});

describe("MemberService.createInvite", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("7 日有効のリンクを作り、保存するのは鍵の SHA-256 だけ", async () => {
    const { db, service } = setup();

    const created = await createInvite(service);
    const key = keyOf(created.url);

    expect(created.url).toBe(`${APP_URL}/join?key=${key}`);
    expect(key).toMatch(/^hkd_iv_test/);
    expect(created.expiresAt).toBe("2026-11-08T00:00:00.000Z");

    const row = await db.select().from(inviteLinks).get();
    expect(row).toMatchObject({
      id: created.id,
      keyHash: await hashToken(key),
      createdBy: OWNER,
      createdAt: NOW.toISOString(),
      expiresAt: "2026-11-08T00:00:00.000Z",
      revokedAt: null
    });
    expect(JSON.stringify(row)).not.toContain(key);
  });

  test("メンバーでない人はリンクを作れない", async () => {
    const { db, service } = setup();

    expect(await service.createInvite("nobody@example.test")).toMatchObject({
      ok: false,
      kind: "forbidden"
    });
    expect(await db.select().from(inviteLinks).all()).toEqual([]);
  });

  test("大文字まじりのメンバーでも作れる", async () => {
    const { service } = setup();
    await joinedMember(service, "hanako@example.test");

    expect((await service.createInvite("Hanako@Example.Test")).ok).toBe(true);
  });
});

describe("MemberService.redeem", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("リンクを開いた人がメンバーになり、小文字で保存される", async () => {
    const { db, service } = setup();
    const invite = await createInvite(service);

    const redeemed = await service.redeem("Hanako@Example.Test", keyOf(invite.url));

    expect(redeemed).toEqual({ ok: true, value: { joined: true } });
    expect(await memberRow(db, "hanako@example.test")).toMatchObject({
      email: "hanako@example.test",
      joinedAt: NOW.toISOString(),
      inviteLinkId: invite.id,
      removedAt: null,
      removedBy: null
    });
  });

  test("すでにメンバーの人はエラーにせず joined false を返す", async () => {
    const { db, service } = setup();
    await joinedMember(service, "hanako@example.test");
    const other = await createInvite(service);

    const redeemed = await service.redeem("HANAKO@example.test", keyOf(other.url));

    expect(redeemed).toEqual({ ok: true, value: { joined: false } });
    expect((await memberRow(db, "hanako@example.test"))?.inviteLinkId).not.toBe(other.id);
  });

  test("オーナーがリンクを開いても joined false", async () => {
    const { service } = setup();
    const invite = await createInvite(service);

    expect(await service.redeem(OWNER, keyOf(invite.url))).toEqual({
      ok: true,
      value: { joined: false }
    });
  });

  test("知らない鍵・形の崩れた鍵はどれも同じ文言で断る", async () => {
    const { db, service } = setup();

    expect(await service.redeem("hanako@example.test", "hkd_iv_missing")).toEqual(INVALID_LINK);
    expect(await service.redeem("hanako@example.test", "broken")).toEqual(INVALID_LINK);
    expect(await db.select().from(members).all()).toEqual([]);
  });

  test("取り消したリンクは使えない", async () => {
    const { service } = setup();
    const invite = await createInvite(service);
    expect(await service.revokeInvite(OWNER, invite.id)).toEqual({ ok: true, value: undefined });

    expect(await service.redeem("hanako@example.test", keyOf(invite.url))).toEqual(INVALID_LINK);
  });

  test("期限は 7 日ちょうどで切れ、7 日より前なら使える", async () => {
    const first = setup();
    const firstInvite = await createInvite(first.service);
    first.setClock(new Date(NOW.getTime() + 7 * DAY_MS));
    expect(await first.service.redeem("hanako@example.test", keyOf(firstInvite.url))).toEqual(
      INVALID_LINK
    );

    const second = setup();
    const secondInvite = await createInvite(second.service);
    second.setClock(new Date(NOW.getTime() + 7 * DAY_MS - 1));
    expect(await second.service.redeem("hanako@example.test", keyOf(secondInvite.url))).toEqual({
      ok: true,
      value: { joined: true }
    });
  });

  test("外された人は新しいリンクで戻れ、取り消した古いリンクでは戻れない", async () => {
    const { db, service, setClock } = setup();
    const oldInvite = await createInvite(service);
    await service.redeem("hanako@example.test", keyOf(oldInvite.url));
    await service.remove(OWNER, "hanako@example.test");
    await service.revokeInvite(OWNER, oldInvite.id);
    const later = new Date(NOW.getTime() + DAY_MS);
    setClock(later);
    const newInvite = await createInvite(service);

    expect(await service.redeem("hanako@example.test", keyOf(oldInvite.url))).toEqual(INVALID_LINK);

    expect(await service.redeem("hanako@example.test", keyOf(newInvite.url))).toEqual({
      ok: true,
      value: { joined: true }
    });
    expect(await memberRow(db, "hanako@example.test")).toMatchObject({
      joinedAt: later.toISOString(),
      inviteLinkId: newInvite.id,
      removedAt: null,
      removedBy: null
    });
  });
});

describe("MemberService.list", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("有効なメンバーとオーナーを返し、外した人は含めない", async () => {
    const { service } = setup();
    await joinedMember(service, "hanako@example.test");
    await joinedMember(service, "taro@example.test");
    await service.remove(OWNER, "taro@example.test");

    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([
      { email: "hanako@example.test", joinedAt: NOW.toISOString(), isOwner: false },
      { email: OWNER, joinedAt: NOW.toISOString(), isOwner: true }
    ]);
  });

  test("空でもエラーにせず空の一覧を返す", async () => {
    const { service } = setup({ ownerEmails: [] });

    expect(await service.list()).toEqual({ ok: true, value: [] });
  });
});

describe("MemberService.listInvites", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("自分が作った有効なリンクだけを、鍵と url を除いて返す", async () => {
    const { service } = setup();
    const joinInviteId = await joinedMember(service, "hanako@example.test");
    await service.revokeInvite(OWNER, joinInviteId);
    const ownerInvite = await createInvite(service);
    const hanakoInvite = await createInvite(service, "hanako@example.test");

    const listed = await service.listInvites("OWNER@example.test");

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((invite) => invite.id).sort()).toEqual([ownerInvite.id]);
    expect(listed.value[0]).toEqual({
      id: ownerInvite.id,
      createdAt: NOW.toISOString(),
      expiresAt: "2026-11-08T00:00:00.000Z"
    });
    expect(JSON.stringify(listed.value)).not.toContain(keyOf(ownerInvite.url));
    expect(JSON.stringify(listed.value)).not.toContain(keyOf(hanakoInvite.url));
  });

  test("止めたリンクと期限が切れたリンクは含めない", async () => {
    const first = setup();
    const active = await createInvite(first.service);
    const revoked = await createInvite(first.service);
    await first.service.revokeInvite(OWNER, revoked.id);

    const listed = await first.service.listInvites(OWNER);

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((invite) => invite.id)).toEqual([active.id]);

    first.setClock(new Date(NOW.getTime() + 7 * DAY_MS));
    expect(await first.service.listInvites(OWNER)).toEqual({ ok: true, value: [] });
  });

  test("メンバーでない人は見られない", async () => {
    const { service } = setup();

    expect(await service.listInvites("nobody@example.test")).toMatchObject({
      ok: false,
      kind: "forbidden"
    });
  });
});

describe("MemberService.remove", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("オーナーは大文字小文字を問わず外せない", async () => {
    const { service } = setup();

    expect(await service.remove(OWNER, "OWNER@Example.Test")).toMatchObject({
      ok: false,
      kind: "forbidden"
    });
  });

  test("自分は外せない", async () => {
    const { service } = setup();
    await joinedMember(service, "hanako@example.test");

    expect(await service.remove("hanako@example.test", "Hanako@Example.Test")).toMatchObject({
      ok: false,
      kind: "forbidden"
    });
  });

  test("メンバーでない人は notFound", async () => {
    const { service } = setup();

    expect(await service.remove(OWNER, "nobody@example.test")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });

  test("外すとメンバーでなくなり、大文字小文字を問わず grant を取り消す", async () => {
    const { db, service, revoked } = setup();
    await joinedMember(service, "hanako@example.test");

    const removed = await service.remove(OWNER, "Hanako@Example.Test");

    expect(removed).toEqual({ ok: true, value: undefined });
    expect(await service.isMember("hanako@example.test")).toBe(false);
    expect(revoked).toEqual(["hanako@example.test"]);
    expect(await memberRow(db, "hanako@example.test")).toMatchObject({
      removedAt: NOW.toISOString(),
      removedBy: OWNER
    });
  });

  test("grant の取り消しに失敗したらその失敗を返す", async () => {
    const { service } = setup({ revokeResult: upstream("取り消せませんでした") });
    await joinedMember(service, "hanako@example.test");

    expect(await service.remove(OWNER, "hanako@example.test")).toMatchObject({
      ok: false,
      kind: "upstream"
    });
  });
});

describe("MemberService.revokeInvite", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("メンバーはリンクを止められる", async () => {
    const { service } = setup();
    await joinedMember(service, "hanako@example.test");
    const invite = await createInvite(service);

    expect(await service.revokeInvite("Hanako@Example.Test", invite.id)).toEqual({
      ok: true,
      value: undefined
    });
  });

  test("メンバーでない人は止められない", async () => {
    const { service } = setup();
    const invite = await createInvite(service);

    expect(await service.revokeInvite("nobody@example.test", invite.id)).toMatchObject({
      ok: false,
      kind: "forbidden"
    });
  });

  test("知らないリンクは notFound", async () => {
    const { service } = setup();

    expect(await service.revokeInvite(OWNER, "missing")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });
});

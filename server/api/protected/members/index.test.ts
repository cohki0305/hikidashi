import { describe, expect, test } from "bun:test";
import type { MemberServicePort } from "@/server/api/protected/invites";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, notFound, ok, type Result } from "@/server/lib/result";
import type { MemberItem } from "@/shared/schemas/members";

const OWNER = "owner@example.test";
const HANAKO = "hanako@example.test";
const NOW = "2026-11-01T00:00:00.000Z";

const verify: AccessVerifier = async (jwt) =>
  jwt ? ok({ email: jwt }) : forbidden("検証に失敗しました");

const access = (email: string) => ({ "Cf-Access-Jwt-Assertion": email });

type MemberCall = { method: "list" } | { method: "remove"; actor: string; target: string };

function fakeMemberService(
  options: {
    members?: MemberItem[];
    removeResult?: (actor: string, target: string) => Result<void>;
  } = {}
) {
  const calls: MemberCall[] = [];
  const service: MemberServicePort = {
    list: async () => {
      calls.push({ method: "list" });
      return ok(
        options.members ?? [
          { email: HANAKO, joinedAt: NOW, isOwner: false },
          { email: OWNER, joinedAt: NOW, isOwner: true }
        ]
      );
    },
    remove: async (actor, target) => {
      calls.push({ method: "remove", actor, target });
      return options.removeResult?.(actor, target) ?? ok(undefined);
    },
    redeem: async () => ok({ joined: true }),
    createInvite: async () =>
      ok({ id: "invite-1", url: "https://example.test/join", expiresAt: NOW }),
    listInvites: async () => ok([]),
    revokeInvite: async () => ok(undefined)
  };
  return { calls, service };
}

function build(service?: MemberServicePort) {
  return createApp({
    logError: () => {},
    accessVerifier: verify,
    isMember: async (email) => email === OWNER || email === HANAKO,
    memberService: service ?? fakeMemberService().service
  });
}

const listMembers = (app: ReturnType<typeof build>, email = OWNER) =>
  app.request("/api/members", { headers: access(email) });
const removeMember = (app: ReturnType<typeof build>, email: string, actor = OWNER) =>
  app.request(`/api/members/${email}`, { method: "DELETE", headers: access(actor) });

describe("GET /api/members", () => {
  test("有効なメンバーを返し、自分に isMe を付ける", async () => {
    const { service, calls } = fakeMemberService();

    const response = await listMembers(build(service), OWNER);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [
        { email: HANAKO, joinedAt: NOW, isOwner: false, isMe: false },
        { email: OWNER, joinedAt: NOW, isOwner: true, isMe: true }
      ]
    });
    expect(calls).toEqual([{ method: "list" }]);
  });

  test("見ている人によって isMe が変わる", async () => {
    const { service } = fakeMemberService();

    const body = (await (await listMembers(build(service), HANAKO)).json()) as {
      members: { email: string; joinedAt: string; isOwner: boolean; isMe: boolean }[];
    };

    expect(body.members).toEqual([
      { email: HANAKO, joinedAt: NOW, isOwner: false, isMe: true },
      { email: OWNER, joinedAt: NOW, isOwner: true, isMe: false }
    ]);
  });

  test("Service の失敗をそのまま返す", async () => {
    const service: MemberServicePort = {
      ...fakeMemberService().service,
      list: async () => notFound("読めません")
    };

    const response = await listMembers(build(service));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });

  test("メンバーでない人は 403、JWT が無ければ 401", async () => {
    const app = build();

    expect((await listMembers(app, "nobody@example.test")).status).toBe(403);
    expect((await app.request("/api/members")).status).toBe(401);
  });

  test("Service が無ければ 404 で塞ぐ（fail closed）", async () => {
    const app = createApp({
      logError: () => {},
      accessVerifier: verify,
      isMember: async () => true
    });

    expect((await listMembers(app)).status).toBe(404);
  });
});

describe("DELETE /api/members/:email", () => {
  test("オーナーや自分を外そうとして Service が断れば 403", async () => {
    const { service } = fakeMemberService({
      removeResult: () => forbidden("自分は外せません")
    });

    const response = await removeMember(build(service), HANAKO, HANAKO);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ kind: "forbidden" });
  });

  test("存在しない人を Service が返さなければ 404", async () => {
    const { service } = fakeMemberService({
      removeResult: () => notFound("そのメンバーは見つかりません")
    });

    const response = await removeMember(build(service), "nobody@example.test");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });

  test("メールアドレスの形でなければ 404 で、Service を呼ばない", async () => {
    const { service, calls } = fakeMemberService();

    expect((await removeMember(build(service), "hanako")).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test("外せたら 200 で、見ている人と相手を Service に渡す", async () => {
    const { service, calls } = fakeMemberService();

    const response = await removeMember(build(service), HANAKO, OWNER);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toEqual([{ method: "remove", actor: OWNER, target: HANAKO }]);
  });

  test("メンバーでない人は 403、JWT が無ければ 401", async () => {
    const app = build();

    expect((await removeMember(app, HANAKO, "nobody@example.test")).status).toBe(403);
    expect((await app.request(`/api/members/${HANAKO}`, { method: "DELETE" })).status).toBe(401);
  });
});

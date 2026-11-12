import { describe, expect, test } from "bun:test";
import type { MemberServicePort } from "@/server/api/protected/invites";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, invalid, notFound, ok, type Result } from "@/server/lib/result";

const OWNER = "owner@example.test";
const HANAKO = "hanako@example.test";
const NOW = "2026-11-01T00:00:00.000Z";
const APP_URL = "https://hikidashi.example.test";

const verify: AccessVerifier = async (jwt) => {
  if (!jwt) return forbidden("検証に失敗しました");
  if (jwt === "valid-jwt") return ok({ email: "invitee@example.com" });
  return ok({ email: jwt });
};

const access = (email: string) => ({ "Cf-Access-Jwt-Assertion": email });

type RedeemCall = { method: "redeem"; email: string; key: string };
type InviteCall =
  | { method: "createInvite"; email: string }
  | { method: "listInvites"; email: string }
  | { method: "revokeInvite"; email: string; id: string };

type ServiceCall = RedeemCall | InviteCall;

function fakeMemberService(
  options: {
    redeemResult?: Result<{ joined: boolean }>;
    createResult?: Result<{ id: string; url: string; expiresAt: string }>;
    listResult?: Result<{ id: string; createdAt: string; expiresAt: string }[]>;
    revokeResult?: Result<void>;
  } = {}
) {
  const calls: ServiceCall[] = [];
  const service: MemberServicePort = {
    redeem: async (email, key) => {
      calls.push({ method: "redeem", email, key });
      return options.redeemResult ?? ok({ joined: true });
    },
    createInvite: async (email) => {
      calls.push({ method: "createInvite", email });
      return (
        options.createResult ??
        ok({
          id: "invite-1",
          url: `${APP_URL}/join?key=hkd_iv_test`,
          expiresAt: "2026-11-08T00:00:00.000Z"
        })
      );
    },
    listInvites: async (email) => {
      calls.push({ method: "listInvites", email });
      return (
        options.listResult ??
        ok([{ id: "invite-1", createdAt: NOW, expiresAt: "2026-11-08T00:00:00.000Z" }])
      );
    },
    revokeInvite: async (email, id) => {
      calls.push({ method: "revokeInvite", email, id });
      return options.revokeResult ?? ok(undefined);
    },
    list: async () => ok([]),
    remove: async () => ok(undefined)
  };
  return { calls, service };
}

function build(
  options: { service?: MemberServicePort; isMember?: (email: string) => Promise<boolean> } = {}
) {
  return createApp({
    logError: () => {},
    accessVerifier: verify,
    isMember: options.isMember ?? (async (email) => email === OWNER || email === HANAKO),
    memberService: Object.hasOwn(options, "service") ? options.service : fakeMemberService().service
  });
}

const redeem = (
  app: ReturnType<typeof build>,
  body: string,
  headers: Record<string, string> = access("invitee@example.com")
) =>
  app.request("/api/invites/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });

describe("POST /api/invites/redemptions", () => {
  test("メンバーでなくても招待の鍵で参加でき、結果を返す", async () => {
    const fake = fakeMemberService();
    const response = await redeem(
      build({ service: fake.service }),
      JSON.stringify({ key: "hkd_iv_x" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ joined: true });
    expect(fake.calls).toEqual([
      { method: "redeem", email: "invitee@example.com", key: "hkd_iv_x" }
    ]);
  });

  test("使えない鍵は Service の文言で 400", async () => {
    const fake = fakeMemberService({ redeemResult: invalid("このリンクは使えません") });
    const response = await redeem(
      build({ service: fake.service }),
      JSON.stringify({ key: "broken" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "このリンクは使えません",
      kind: "invalid"
    });
  });

  test("本文が鍵の形でなければ 400 で Service を呼ばない", async () => {
    const fake = fakeMemberService();
    const response = await redeem(build({ service: fake.service }), JSON.stringify({ key: "" }));

    expect(response.status).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  test("Access の JWT が無ければ 401", async () => {
    const fake = fakeMemberService();
    const response = await redeem(
      build({ service: fake.service }),
      JSON.stringify({ key: "x" }),
      {}
    );

    expect(response.status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  test("Service が無ければ 404 で塞ぐ（fail closed）", async () => {
    const app = build({ service: undefined });
    const response = await redeem(app, JSON.stringify({ key: "x" }));

    expect(response.status).toBe(404);
  });
});

const getInvites = (app: ReturnType<typeof build>, email = OWNER) =>
  app.request("/api/invites", { headers: access(email) });
const postInvite = (app: ReturnType<typeof build>, email = OWNER) =>
  app.request("/api/invites", { method: "POST", headers: access(email) });
const deleteInvite = (app: ReturnType<typeof build>, id: string, email = OWNER) =>
  app.request(`/api/invites/${id}`, { method: "DELETE", headers: access(email) });

describe("POST /api/invites", () => {
  test("メンバーが作ると id・url・期限を返す", async () => {
    const fake = fakeMemberService();

    const response = await postInvite(build({ service: fake.service }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "invite-1",
      url: `${APP_URL}/join?key=hkd_iv_test`,
      expiresAt: "2026-11-08T00:00:00.000Z"
    });
    expect(fake.calls).toEqual([{ method: "createInvite", email: OWNER }]);
  });

  test("Service が断れば 403 で、url は返さない", async () => {
    const fake = fakeMemberService({ createResult: forbidden("メンバーだけです") });

    const response = await postInvite(build({ service: fake.service }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ kind: "forbidden" });
  });

  test("メンバーでない人は 403、JWT が無ければ 401", async () => {
    const app = build();

    expect((await postInvite(app, "nobody@example.test")).status).toBe(403);
    expect((await app.request("/api/invites", { method: "POST" })).status).toBe(401);
  });
});

describe("GET /api/invites", () => {
  test("自分が作った有効なリンクを返し、url と鍵は出さない", async () => {
    const fake = fakeMemberService();

    const response = await getInvites(build({ service: fake.service }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      invites: [{ id: "invite-1", createdAt: NOW, expiresAt: "2026-11-08T00:00:00.000Z" }]
    });
    expect(JSON.stringify(body)).not.toContain("hkd_iv_");
    expect(JSON.stringify(body)).not.toContain("/join");
    expect(fake.calls).toEqual([{ method: "listInvites", email: OWNER }]);
  });

  test("見ている人自分が作ったリンクだけを Service に尋ねる", async () => {
    const fake = fakeMemberService();

    await getInvites(build({ service: fake.service }), HANAKO);

    expect(fake.calls).toEqual([{ method: "listInvites", email: HANAKO }]);
  });

  test("メンバーでない人は 403、JWT が無ければ 401", async () => {
    const app = build();

    expect((await getInvites(app, "nobody@example.test")).status).toBe(403);
    expect((await app.request("/api/invites")).status).toBe(401);
  });

  test("Service が無ければ 404 で塞ぐ（fail closed）", async () => {
    const app = build({ service: undefined, isMember: async () => true });

    expect((await getInvites(app)).status).toBe(404);
  });
});

describe("DELETE /api/invites/:id", () => {
  test("メンバーが止めると 200 で、見ている人と id を Service に渡す", async () => {
    const fake = fakeMemberService();

    const response = await deleteInvite(build({ service: fake.service }), "invite-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fake.calls).toEqual([{ method: "revokeInvite", email: OWNER, id: "invite-1" }]);
  });

  test("他の人が作ったリンクの id でも Service に渡す（止められる）", async () => {
    const fake = fakeMemberService();

    const response = await deleteInvite(build({ service: fake.service }), "someone-elses", HANAKO);

    expect(response.status).toBe(200);
    expect(fake.calls).toEqual([{ method: "revokeInvite", email: HANAKO, id: "someone-elses" }]);
  });

  test("知らないリンクは 404", async () => {
    const fake = fakeMemberService({ revokeResult: notFound("このリンクは見つかりません") });

    const response = await deleteInvite(build({ service: fake.service }), "missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });
});

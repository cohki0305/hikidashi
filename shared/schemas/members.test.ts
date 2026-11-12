import { describe, expect, it } from "bun:test";
import {
  createdInviteSchema,
  invitesResponseSchema,
  membersResponseSchema,
  redeemInviteRequestSchema,
  redeemInviteResponseSchema
} from "./members";

const MEMBER = {
  email: "hanako@example.test",
  joinedAt: "2026-11-01T00:00:00.000Z",
  isOwner: false,
  isMe: false
};

describe("membersResponseSchema", () => {
  it("メンバーの一覧を通す", () => {
    expect(membersResponseSchema.safeParse({ members: [MEMBER] }).success).toBe(true);
  });

  it("メールアドレスの形でなければ弾く", () => {
    expect(
      membersResponseSchema.safeParse({ members: [{ ...MEMBER, email: "hanako" }] }).success
    ).toBe(false);
  });

  it("isOwner が無ければ弾く", () => {
    const { isOwner: _isOwner, ...rest } = MEMBER;
    expect(membersResponseSchema.safeParse({ members: [rest] }).success).toBe(false);
  });

  it("isMe が無ければ弾く", () => {
    const { isMe: _isMe, ...rest } = MEMBER;
    expect(membersResponseSchema.safeParse({ members: [rest] }).success).toBe(false);
  });
});

describe("invitesResponseSchema", () => {
  const INVITE = {
    id: "invite-1",
    createdAt: "2026-11-01T00:00:00.000Z",
    expiresAt: "2026-11-08T00:00:00.000Z"
  };

  it("有効なリンクの一覧を通す", () => {
    expect(invitesResponseSchema.safeParse({ invites: [INVITE] }).success).toBe(true);
  });

  it("id が空なら弾く", () => {
    expect(invitesResponseSchema.safeParse({ invites: [{ ...INVITE, id: "" }] }).success).toBe(
      false
    );
  });

  it("expiresAt が日時の形でなければ弾く", () => {
    expect(
      invitesResponseSchema.safeParse({ invites: [{ ...INVITE, expiresAt: "tomorrow" }] }).success
    ).toBe(false);
  });
});

describe("createdInviteSchema", () => {
  it("作ったリンクの応答を通す", () => {
    const invite = {
      id: "invite-1",
      url: "https://hikidashi.example.test/join?key=hkd_iv_test",
      expiresAt: "2026-11-08T00:00:00.000Z"
    };
    expect(createdInviteSchema.safeParse(invite).success).toBe(true);
  });

  it("url が空なら弾く", () => {
    const invite = { id: "invite-1", url: "", expiresAt: "2026-11-08T00:00:00.000Z" };
    expect(createdInviteSchema.safeParse(invite).success).toBe(false);
  });
});

describe("redeemInviteRequestSchema", () => {
  it("鍵を受け取る", () => {
    expect(redeemInviteRequestSchema.safeParse({ key: "hkd_iv_test" }).success).toBe(true);
  });

  it("鍵が空なら弾く", () => {
    expect(redeemInviteRequestSchema.safeParse({ key: "" }).success).toBe(false);
  });
});

describe("redeemInviteResponseSchema", () => {
  it("入れたかどうかを返す", () => {
    expect(redeemInviteResponseSchema.safeParse({ joined: true }).success).toBe(true);
  });

  it("joined が無ければ弾く", () => {
    expect(redeemInviteResponseSchema.safeParse({}).success).toBe(false);
  });
});

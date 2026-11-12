import { describe, expect, it } from "bun:test";
import { inviteIdParamsSchema, joinInviteRequestSchema } from "./invite";

describe("joinInviteRequestSchema", () => {
  it("鍵を受け取る", () => {
    expect(joinInviteRequestSchema.safeParse({ key: "hkd_iv_test" }).success).toBe(true);
  });

  it("鍵が空なら弾く", () => {
    expect(joinInviteRequestSchema.safeParse({ key: "" }).success).toBe(false);
  });

  it("key が無ければ弾く", () => {
    expect(joinInviteRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("inviteIdParamsSchema", () => {
  it("リンクの id を受け取る", () => {
    expect(inviteIdParamsSchema.safeParse({ id: "invite-1" }).success).toBe(true);
  });

  it("id が空なら弾く", () => {
    expect(inviteIdParamsSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("id が無ければ弾く", () => {
    expect(inviteIdParamsSchema.safeParse({}).success).toBe(false);
  });
});

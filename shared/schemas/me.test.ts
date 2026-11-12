import { describe, expect, it } from "bun:test";
import { meResponseSchema } from "./me";

describe("meResponseSchema", () => {
  it("メールアドレスとメンバーかどうかを持つ応答を通す", () => {
    expect(
      meResponseSchema.safeParse({ email: "member@example.com", isMember: false }).success
    ).toBe(true);
  });

  it("メールアドレスの形でなければ弾く", () => {
    expect(meResponseSchema.safeParse({ email: "member" }).success).toBe(false);
  });

  it("email が無ければ弾く", () => {
    expect(meResponseSchema.safeParse({ isMember: true }).success).toBe(false);
  });

  it("isMember が無ければ弾く", () => {
    expect(meResponseSchema.safeParse({ email: "member@example.com" }).success).toBe(false);
  });
});

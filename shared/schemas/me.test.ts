import { describe, expect, it } from "bun:test";
import { meResponseSchema } from "./me";

describe("meResponseSchema", () => {
  it("メールアドレスを持つ応答を通す", () => {
    expect(meResponseSchema.safeParse({ email: "member@example.com" }).success).toBe(true);
  });

  it("メールアドレスの形でなければ弾く", () => {
    expect(meResponseSchema.safeParse({ email: "member" }).success).toBe(false);
  });

  it("email が無ければ弾く", () => {
    expect(meResponseSchema.safeParse({}).success).toBe(false);
  });
});

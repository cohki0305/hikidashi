import { describe, expect, it } from "bun:test";
import { memberEmailParamsSchema } from "./member";

describe("memberEmailParamsSchema", () => {
  it("メールアドレスを受け取る", () => {
    expect(memberEmailParamsSchema.safeParse({ email: "hanako@example.test" }).success).toBe(true);
  });

  it("メールアドレスの形でなければ弾く", () => {
    expect(memberEmailParamsSchema.safeParse({ email: "hanako" }).success).toBe(false);
  });

  it("email が無ければ弾く", () => {
    expect(memberEmailParamsSchema.safeParse({}).success).toBe(false);
  });
});

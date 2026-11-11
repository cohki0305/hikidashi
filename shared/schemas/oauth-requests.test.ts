import { describe, expect, test } from "bun:test";
import {
  oauthRedirectResponseSchema,
  oauthRequestResponseSchema
} from "@/shared/schemas/oauth-requests";

describe("oauthRequestResponseSchema", () => {
  test("つなぐ相手の名前と状態を持つ", () => {
    expect(oauthRequestResponseSchema.parse({ clientName: "Claude", status: "pending" })).toEqual({
      clientName: "Claude",
      status: "pending"
    });
    expect(oauthRequestResponseSchema.parse({ clientName: "Claude", status: "expired" })).toEqual({
      clientName: "Claude",
      status: "expired"
    });
  });

  test("知らない状態・名前の欠けは弾く", () => {
    expect(
      oauthRequestResponseSchema.safeParse({ clientName: "Claude", status: "done" }).success
    ).toBe(false);
    expect(oauthRequestResponseSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});

describe("oauthRedirectResponseSchema", () => {
  test("戻り先を持つ", () => {
    expect(
      oauthRedirectResponseSchema.parse({ redirectTo: "https://claude.ai/cb?code=x" })
    ).toEqual({
      redirectTo: "https://claude.ai/cb?code=x"
    });
  });

  test("戻り先が無ければ弾く", () => {
    expect(oauthRedirectResponseSchema.safeParse({}).success).toBe(false);
  });
});

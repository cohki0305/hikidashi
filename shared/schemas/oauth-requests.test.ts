import { describe, expect, test } from "bun:test";
import {
  oauthRedirectResponseSchema,
  oauthRequestResponseSchema
} from "@/shared/schemas/oauth-requests";

describe("oauthRequestResponseSchema", () => {
  test("つなぐ相手の名前と戻り先のホストと状態を持つ", () => {
    expect(
      oauthRequestResponseSchema.parse({
        clientName: "Claude",
        redirectHost: "claude.ai",
        status: "pending"
      })
    ).toEqual({
      clientName: "Claude",
      redirectHost: "claude.ai",
      status: "pending"
    });
    expect(
      oauthRequestResponseSchema.parse({
        clientName: "Claude",
        redirectHost: "claude.ai",
        status: "expired"
      })
    ).toEqual({
      clientName: "Claude",
      redirectHost: "claude.ai",
      status: "expired"
    });
  });

  test("知らない状態・名前や戻り先の欠けは弾く", () => {
    expect(
      oauthRequestResponseSchema.safeParse({
        clientName: "Claude",
        redirectHost: "claude.ai",
        status: "done"
      }).success
    ).toBe(false);
    expect(
      oauthRequestResponseSchema.safeParse({ redirectHost: "claude.ai", status: "pending" }).success
    ).toBe(false);
    expect(
      oauthRequestResponseSchema.safeParse({ clientName: "Claude", status: "pending" }).success
    ).toBe(false);
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

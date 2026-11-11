import { describe, expect, test } from "bun:test";
import { oauthRequestIdParamsSchema } from "@/shared/schemas/oauth-requests/request/oauth-request";

describe("oauthRequestIdParamsSchema", () => {
  test("uuid の id を通す", () => {
    expect(
      oauthRequestIdParamsSchema.parse({ id: "11111111-1111-4111-8111-111111111111" })
    ).toEqual({ id: "11111111-1111-4111-8111-111111111111" });
  });

  test("uuid でない id は弾く", () => {
    expect(oauthRequestIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

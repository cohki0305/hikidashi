import { describe, expect, test } from "bun:test";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, ok } from "@/server/lib/result";

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

function buildApp(isMember: (email: string) => Promise<boolean> = async () => false) {
  return createApp({ logError: () => {}, accessVerifier: verify, isMember });
}

describe("GET /api/me", () => {
  test("ログイン中のメールアドレスと、メンバーかどうかを返す", async () => {
    const response = await buildApp().request("/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "member@example.com", isMember: false });
  });

  test("メンバーなら isMember が true", async () => {
    const response = await buildApp(async () => true).request("/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "member@example.com", isMember: true });
  });

  test("認証なしは 401", async () => {
    const response = await buildApp().request("/api/me");

    expect(response.status).toBe(401);
  });

  test("検証に失敗したら 401", async () => {
    const response = await buildApp().request("/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "broken-jwt" }
    });

    expect(response.status).toBe(401);
  });
});

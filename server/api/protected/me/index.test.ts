import { describe, expect, test } from "bun:test";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, ok } from "@/server/lib/result";

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

function buildApp() {
  return createApp({ logError: () => {}, accessVerifier: verify });
}

describe("GET /api/me", () => {
  test("ログイン中のメールアドレスを返す", async () => {
    const response = await buildApp().request("/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-jwt" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "member@example.com" });
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

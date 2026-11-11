import { describe, expect, test } from "bun:test";
import { isAllowedRedirectUri, redirectWith } from "./redirect-uri";

describe("isAllowedRedirectUri", () => {
  test("https と、localhost・127.0.0.1 の http（ポート任意）を受ける", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/cb")).toBe(true);
  });

  test("ほかの http・独自の形式・壊れた値・fragment 付き・認証情報付きは受けない", () => {
    expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost.example.test/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("myapp://callback")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("https://user:pass@claude.ai/cb")).toBe(false);
  });
});

describe("redirectWith", () => {
  test("値を足し、null は足さず、戻り先のクエリは残す", () => {
    const url = new URL(
      redirectWith("https://claude.ai/cb?x=1", { code: "hkd_cd_a", state: null })
    );
    expect(url.searchParams.get("x")).toBe("1");
    expect(url.searchParams.get("code")).toBe("hkd_cd_a");
    expect(url.searchParams.has("state")).toBe(false);
  });
});

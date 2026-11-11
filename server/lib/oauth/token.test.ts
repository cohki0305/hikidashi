import { describe, expect, test } from "bun:test";
import { generateClientId, generateToken, hashToken } from "./token";

describe("generateToken", () => {
  test("種類ごとの接頭辞と 32 バイトの base64url", () => {
    for (const [kind, prefix] of [
      ["access", "hkd_at_"],
      ["refresh", "hkd_rt_"],
      ["code", "hkd_cd_"]
    ] as const) {
      const token = generateToken(kind);
      expect(token.startsWith(prefix)).toBe(true);
      expect(token.slice(prefix.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  test("毎回違う", () => {
    expect(generateToken("access")).not.toBe(generateToken("access"));
  });
});

describe("hashToken", () => {
  test("sha256 の hex（64 字）で、平文を含まない", async () => {
    const hash = await hashToken("hkd_at_abc");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("abc");
    expect(await hashToken("hkd_at_abc")).toBe(hash);
    expect(await hashToken("hkd_at_abd")).not.toBe(hash);
  });

  test("既知の値", async () => {
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("generateClientId", () => {
  test("ランダム 32 字", () => {
    expect(generateClientId()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generateClientId()).not.toBe(generateClientId());
  });
});

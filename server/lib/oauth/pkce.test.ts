import { describe, expect, test } from "bun:test";
import { isCodeChallenge, verifyS256 } from "./pkce";

// RFC 7636 付録 B の組
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("verifyS256", () => {
  test("合う verifier は true", async () => {
    expect(await verifyS256(VERIFIER, CHALLENGE)).toBe(true);
  });

  test("合わない verifier は false", async () => {
    expect(await verifyS256(`${VERIFIER}x`, CHALLENGE)).toBe(false);
    expect(await verifyS256("", CHALLENGE)).toBe(false);
  });

  test("規格の長さ・文字に収まらない verifier は false", async () => {
    expect(await verifyS256("short", CHALLENGE)).toBe(false);
    expect(await verifyS256("a".repeat(129), CHALLENGE)).toBe(false);
    expect(await verifyS256(`${VERIFIER.slice(1)}!`, CHALLENGE)).toBe(false);
  });
});

describe("isCodeChallenge", () => {
  test("43 字の base64url だけ true", () => {
    expect(isCodeChallenge(CHALLENGE)).toBe(true);
    expect(isCodeChallenge(CHALLENGE.slice(1))).toBe(false);
    expect(isCodeChallenge(`${CHALLENGE.slice(1)}=`)).toBe(false);
  });
});

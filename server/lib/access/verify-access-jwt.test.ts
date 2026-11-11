import { describe, expect, it } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAccessVerifier } from "./verify-access-jwt";

const TEAM_DOMAIN = "https://hikidashi.cloudflareaccess.com";
const AUDIENCE = "test-audience";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({
    keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }]
  });
  const verify = createAccessVerifier({ teamDomain: TEAM_DOMAIN, audience: AUDIENCE, keySet });
  const sign = (
    claims: Record<string, unknown>,
    options: {
      issuer?: string;
      audience?: string;
      kid?: string;
      expirationTime?: string | number;
      notBefore?: string | number;
    } = {}
  ) => {
    let jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "test-key" })
      .setIssuer(options.issuer ?? TEAM_DOMAIN)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expirationTime ?? "5m");
    if (options.notBefore !== undefined) jwt = jwt.setNotBefore(options.notBefore);
    return jwt.sign(privateKey);
  };
  return { verify, sign };
}

describe("createAccessVerifier", () => {
  it("正しい JWT からメールアドレスを取り出す", async () => {
    const { verify, sign } = await setup();
    const result = await verify(await sign({ email: "member@example.com" }));
    expect(result).toEqual({ ok: true, value: { email: "member@example.com" } });
  });

  it("メールアドレスが無い JWT は invalid", async () => {
    const { verify, sign } = await setup();
    const result = await verify(await sign({ sub: "user-1" }));
    expect(result.ok).toBe(false);
  });

  it("aud が違う JWT は通さない", async () => {
    const { verify, sign } = await setup();
    const result = await verify(await sign({ email: "member@example.com" }, { audience: "other" }));
    expect(result.ok).toBe(false);
  });

  it("iss が違う JWT は通さない", async () => {
    const { verify, sign } = await setup();
    const result = await verify(
      await sign({ email: "member@example.com" }, { issuer: "https://other.cloudflareaccess.com" })
    );
    expect(result.ok).toBe(false);
  });

  it("別の鍵で署名された JWT は通さない", async () => {
    const { verify } = await setup();
    const other = await generateKeyPair("RS256");
    const jwt = await new SignJWT({ email: "member@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(TEAM_DOMAIN)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);
    const result = await verify(jwt);
    expect(result.ok).toBe(false);
  });

  it("期限切れの JWT は通さない", async () => {
    const { verify, sign } = await setup();
    const result = await verify(
      await sign(
        { email: "member@example.com" },
        { expirationTime: Math.floor(Date.now() / 1000) - 60 }
      )
    );
    expect(result.ok).toBe(false);
  });

  it("有効開始前（nbf が未来）の JWT は通さない", async () => {
    const { verify, sign } = await setup();
    const result = await verify(
      await sign(
        { email: "member@example.com" },
        { notBefore: Math.floor(Date.now() / 1000) + 3600 }
      )
    );
    expect(result.ok).toBe(false);
  });

  it("壊れた JWT でも例外を投げず Result を返す", async () => {
    const { verify } = await setup();
    const result = await verify("not-a-jwt");
    expect(result.ok).toBe(false);
  });
});

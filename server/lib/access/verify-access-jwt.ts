import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { forbidden, invalid, ok, type Result } from "@/server/lib/result";

/** Access の JWT を受け取り、本人のメールアドレスを返す。失敗は Result で返す。 */
export type AccessVerifier = (jwt: string) => Promise<Result<{ email: string }>>;

export type AccessJwtConfig = {
  teamDomain: string;
  audience: string;
  /** テストで差し替える鍵の口。省略すると Access の証明書を取りに行く。 */
  keySet?: JWTVerifyGetKey;
};

function normalizeOrigin(teamDomain: string): string {
  const withScheme = /^https?:\/\//.test(teamDomain) ? teamDomain : `https://${teamDomain}`;
  return withScheme.replace(/\/+$/, "");
}

/** 本番は Cloudflare Access の証明書で aud と iss を検証する。 */
export function createAccessVerifier(config: AccessJwtConfig): AccessVerifier {
  const issuer = normalizeOrigin(config.teamDomain);
  const keySet = config.keySet ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return async (jwt) => {
    try {
      const { payload } = await jwtVerify(jwt, keySet, {
        issuer,
        audience: config.audience,
        algorithms: ["RS256"]
      });
      if (typeof payload.email !== "string" || payload.email.length === 0)
        return invalid("Access の JWT にメールアドレスがありません");
      return ok({ email: payload.email });
    } catch {
      return forbidden("Access の JWT を検証できませんでした");
    }
  };
}

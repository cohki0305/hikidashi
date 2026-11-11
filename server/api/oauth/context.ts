import type { Context } from "hono";
import type { AccessEnv } from "@/server/middleware/require-access";
import type { OAuthService } from "@/server/services/oauth-service";

/** 公開の OAuth ルートが使う Service の口。 */
export type OAuthServicePort = Pick<
  OAuthService,
  "register" | "startAuthorization" | "exchangeCode" | "refresh"
>;

export type OAuthEnv = {
  Bindings: AccessEnv;
  Variables: { oauth: OAuthServicePort; appUrl: string };
};

/** 201 で返す。handlers から c.json を直接呼ばずに済ませるための小さな口。 */
export function created<T>(c: Context, body: T) {
  return c.json(body, 201);
}

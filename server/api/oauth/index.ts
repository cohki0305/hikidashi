import type { MiddlewareHandler } from "hono";
import { createFactory } from "hono/factory";
import type { AccessEnv } from "@/server/middleware/require-access";
import type { OAuthEnv, OAuthServicePort } from "./context";
import { oauthRoutes } from "./routes";

const factory = createFactory<OAuthEnv>();

export type OAuthDependencies = {
  oauth?: Partial<OAuthServicePort>;
  appUrl?: string;
  /** `/oauth/authorize` で本人確認する Middleware（requireAccess）。 */
  verifyAccess?: MiddlewareHandler<{ Bindings: AccessEnv }>;
  /** `/oauth/authorize` でメンバーかどうかを確かめる Middleware（requireMember）。 */
  verifyMember?: MiddlewareHandler;
};

function completePort(oauth?: Partial<OAuthServicePort>): OAuthServicePort | null {
  if (!oauth?.register || !oauth.startAuthorization || !oauth.exchangeCode || !oauth.refresh)
    return null;
  return oauth as OAuthServicePort;
}

/**
 * 認証なしで開く OAuth の入口。APP_URL か Service が欠けた構成では何も載せず、
 * 404 にする（fail closed）。`/oauth/authorize` だけは Access の JWT を通す。
 */
export function createOAuthRoutes({
  oauth,
  appUrl,
  verifyAccess,
  verifyMember
}: OAuthDependencies) {
  const port = completePort(oauth);
  if (!port || !appUrl || !verifyAccess || !verifyMember) return factory.createApp();
  const origin = appUrl.replace(/\/+$/, "");
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("oauth", port);
      c.set("appUrl", origin);
      await next();
    })
    .use("/oauth/authorize", verifyAccess)
    .use("/oauth/authorize", verifyMember)
    .route("/", oauthRoutes);
}

export type { OAuthEnv, OAuthServicePort } from "./context";

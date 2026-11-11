import { zValidator } from "@hono/zod-validator";
import { createMiddleware } from "hono/factory";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import type { AccessEnv } from "@/server/middleware/require-access";
import type { OAuthService } from "@/server/services/oauth-service";
import { oauthRequestIdParamsSchema } from "@/shared/schemas/oauth-requests/request/oauth-request";

/** 許可の画面が使う Service の口。 */
export type OAuthRequestServicePort = Pick<OAuthService, "describeRequest" | "approve" | "deny">;

export type OAuthRequestsEnv = {
  Bindings: AccessEnv;
  Variables: { oauthRequests: OAuthRequestServicePort };
};

/** Service を c.var に載せる。欠けていれば入口を塞ぐ（fail closed）。 */
export function provideOAuthRequests(port?: OAuthRequestServicePort) {
  return createMiddleware<OAuthRequestsEnv>(async (c, next) => {
    if (!port) return failure(c, notFound("Not found"));
    c.set("oauthRequests", port);
    await next();
  });
}

/** 許可の画面の id。uuid でなければ、無い id と同じく 404。 */
export const oauthRequestParam = zValidator("param", oauthRequestIdParamsSchema, (result, c) => {
  if (!result.success) return failure(c, notFound("Not found"));
});

import { createFactory } from "hono/factory";
import type { OAuthEnv } from "@/server/api/oauth/context";
import { failure } from "@/server/lib/http";
import { plainText, redirectTo } from "@/server/lib/oauth/http";

const factory = createFactory<OAuthEnv>();

const UNUSABLE_MESSAGE =
  "この AI とのつなぎ方は使えません。AI の画面から、もう一度つなぎ直してください。";

/** 検証して頼みを作り、許可の画面へ送る。 */
export const index = factory.createHandlers(async (c) => {
  const query = c.req.query();
  const result = await c.get("oauth").startAuthorization({
    responseType: query.response_type,
    clientId: query.client_id,
    redirectUri: query.redirect_uri,
    codeChallenge: query.code_challenge,
    codeChallengeMethod: query.code_challenge_method,
    state: query.state,
    resource: query.resource
  });
  if (!result.ok) return failure(c, result);
  const start = result.value;
  if (start.kind === "unusable") return plainText(c, 400, UNUSABLE_MESSAGE);
  if (start.kind === "rejected") return redirectTo(c, start.redirectTo);
  return redirectTo(c, `/authorize?request=${encodeURIComponent(start.requestId)}`);
});

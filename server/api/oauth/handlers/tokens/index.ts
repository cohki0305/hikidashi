import type { Context } from "hono";
import { createFactory } from "hono/factory";
import type { OAuthEnv } from "@/server/api/oauth/context";
import { ok } from "@/server/lib/http";
import { oauthError, stringFields } from "@/server/lib/oauth/http";
import type { TokenSet } from "@/server/services/oauth-service/types";

const factory = createFactory<OAuthEnv>();

const FIELDS = [
  "grant_type",
  "code",
  "code_verifier",
  "client_id",
  "redirect_uri",
  "refresh_token"
] as const;

/** 入力の誤りだけを 400 にし、DB などの一時的な失敗は 503 にする（RFC 6749）。 */
function tokenFailure(c: Context, result: { kind: string; message: string }) {
  return result.kind === "invalid"
    ? oauthError(c, 400, result.message)
    : oauthError(c, 503, "temporarily_unavailable");
}

function tokenResponse(c: Context, tokens: TokenSet) {
  c.header("Cache-Control", "no-store");
  return ok(c, {
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken
  });
}

/** コード・refresh をトークンに替える（RFC 6749 の形で返す）。 */
export const create = factory.createHandlers(async (c) => {
  const form = stringFields(await c.req.parseBody().catch(() => ({})), FIELDS);
  const oauth = c.get("oauth");

  if (form.grant_type === "authorization_code") {
    if (!form.code || !form.code_verifier || !form.client_id || !form.redirect_uri)
      return oauthError(c, 400, "invalid_request");
    const result = await oauth.exchangeCode({
      code: form.code,
      codeVerifier: form.code_verifier,
      clientId: form.client_id,
      redirectUri: form.redirect_uri
    });
    return result.ok ? tokenResponse(c, result.value) : tokenFailure(c, result);
  }

  if (form.grant_type === "refresh_token") {
    if (!form.refresh_token || !form.client_id) return oauthError(c, 400, "invalid_request");
    const result = await oauth.refresh({
      refreshToken: form.refresh_token,
      clientId: form.client_id
    });
    return result.ok ? tokenResponse(c, result.value) : tokenFailure(c, result);
  }

  return oauthError(c, 400, form.grant_type ? "unsupported_grant_type" : "invalid_request");
});

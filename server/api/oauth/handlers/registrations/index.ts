import { createFactory } from "hono/factory";
import { created, type OAuthEnv } from "@/server/api/oauth/context";
import { oauthError, parseRegistration } from "@/server/lib/oauth/http";

const factory = createFactory<OAuthEnv>();

/** AI が自分を登録する（RFC 7591）。 */
export const create = factory.createHandlers(async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const input = parseRegistration(body);
  if (!input) return oauthError(c, 400, "invalid_client_metadata");

  const result = await c.get("oauth").register({
    client_name: input.clientName,
    redirect_uris: input.redirectUris
  });
  if (!result.ok)
    return result.kind === "rate_limited"
      ? oauthError(c, 429, "temporarily_unavailable")
      : oauthError(c, 400, result.message);
  return created(c, result.value);
});

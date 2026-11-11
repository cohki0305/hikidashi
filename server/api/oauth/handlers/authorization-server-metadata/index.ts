import { createFactory } from "hono/factory";
import type { OAuthEnv } from "@/server/api/oauth/context";
import { ok } from "@/server/lib/http";

const factory = createFactory<OAuthEnv>();

/** 認可サーバーの案内（RFC 8414）。 */
export const index = factory.createHandlers((c) => {
  const origin = c.get("appUrl");
  return ok(c, {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true
  });
});

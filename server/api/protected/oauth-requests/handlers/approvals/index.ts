import { createFactory } from "hono/factory";
import {
  type OAuthRequestsEnv,
  oauthRequestParam
} from "@/server/api/protected/oauth-requests/context";
import { failure, ok } from "@/server/lib/http";
import type { OAuthRedirectResponse } from "@/shared/schemas/oauth-requests";

const factory = createFactory<OAuthRequestsEnv>();

export const create = factory.createHandlers(oauthRequestParam, async (c) => {
  const result = await c.get("oauthRequests").approve(c.req.valid("param").id, c.get("email"));
  if (!result.ok) return failure(c, result);
  const body: OAuthRedirectResponse = result.value;
  return ok(c, body);
});

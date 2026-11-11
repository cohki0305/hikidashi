import { createFactory } from "hono/factory";
import {
  type OAuthRequestsEnv,
  oauthRequestParam
} from "@/server/api/protected/oauth-requests/context";
import { failure, ok } from "@/server/lib/http";
import type { OAuthRequestResponse } from "@/shared/schemas/oauth-requests";

const factory = createFactory<OAuthRequestsEnv>();

export const show = factory.createHandlers(oauthRequestParam, async (c) => {
  const result = await c.get("oauthRequests").describeRequest(c.req.valid("param").id);
  if (!result.ok) return failure(c, result);
  const body: OAuthRequestResponse = result.value;
  return ok(c, body);
});

import { createFactory } from "hono/factory";
import * as authorizationServerMetadata from "@/server/api/oauth/handlers/authorization-server-metadata";
import * as authorizations from "@/server/api/oauth/handlers/authorizations";
import * as protectedResourceMetadata from "@/server/api/oauth/handlers/protected-resource-metadata";
import * as registrations from "@/server/api/oauth/handlers/registrations";
import * as tokens from "@/server/api/oauth/handlers/tokens";
import type { OAuthEnv } from "./context";

const factory = createFactory<OAuthEnv>();

export const oauthRoutes = factory
  .createApp()
  .get("/.well-known/oauth-protected-resource", ...protectedResourceMetadata.index)
  .get("/.well-known/oauth-protected-resource/mcp", ...protectedResourceMetadata.index)
  .get("/.well-known/oauth-authorization-server", ...authorizationServerMetadata.index)
  .post("/oauth/register", ...registrations.create)
  .get("/oauth/authorize", ...authorizations.index)
  .post("/oauth/token", ...tokens.create);

import { createFactory } from "hono/factory";
import * as approvals from "@/server/api/protected/oauth-requests/handlers/approvals";
import * as denials from "@/server/api/protected/oauth-requests/handlers/denials";
import * as show from "@/server/api/protected/oauth-requests/handlers/show";
import type { OAuthRequestsEnv } from "./context";

const factory = createFactory<OAuthRequestsEnv>();

export const oauthRequestsRoutes = factory
  .createApp()
  .get("/:id", ...show.show)
  .post("/:id/approvals", ...approvals.create)
  .post("/:id/denials", ...denials.create);

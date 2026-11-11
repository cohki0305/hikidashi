import { createFactory } from "hono/factory";
import type { OAuthRequestServicePort, OAuthRequestsEnv } from "./context";
import { provideOAuthRequests } from "./context";
import { oauthRequestsRoutes } from "./routes";

const factory = createFactory<OAuthRequestsEnv>();

function completePort(oauth?: Partial<OAuthRequestServicePort>): OAuthRequestServicePort | null {
  if (!oauth?.describeRequest || !oauth.approve || !oauth.deny) return null;
  return oauth as OAuthRequestServicePort;
}

/** ログインした人が、AI につないでよいかを答える入口。 */
export function createOAuthRequestRoutes(oauth?: Partial<OAuthRequestServicePort>) {
  return factory
    .createApp()
    .use("*", provideOAuthRequests(completePort(oauth) ?? undefined))
    .route("/", oauthRequestsRoutes);
}

export type { OAuthRequestServicePort } from "./context";

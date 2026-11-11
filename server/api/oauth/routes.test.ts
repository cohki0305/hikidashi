import { describe, expect, test } from "bun:test";
import * as authorizationServerMetadata from "@/server/api/oauth/handlers/authorization-server-metadata";
import * as authorizations from "@/server/api/oauth/handlers/authorizations";
import * as protectedResourceMetadata from "@/server/api/oauth/handlers/protected-resource-metadata";
import * as registrations from "@/server/api/oauth/handlers/registrations";
import * as tokens from "@/server/api/oauth/handlers/tokens";
import { oauthRoutes } from "@/server/api/oauth/routes";

describe("oauthRoutes", () => {
  test("ルート表が各ハンドラを指す", () => {
    const actual = oauthRoutes.routes.map(({ method, path, handler }) => ({
      method,
      path,
      handler
    }));
    expect(actual).toEqual([
      {
        method: "GET",
        path: "/.well-known/oauth-protected-resource",
        handler: protectedResourceMetadata.index[0]
      },
      {
        method: "GET",
        path: "/.well-known/oauth-protected-resource/mcp",
        handler: protectedResourceMetadata.index[0]
      },
      {
        method: "GET",
        path: "/.well-known/oauth-authorization-server",
        handler: authorizationServerMetadata.index[0]
      },
      {
        method: "POST",
        path: "/oauth/register",
        handler: registrations.create[0]
      },
      {
        method: "GET",
        path: "/oauth/authorize",
        handler: authorizations.index[0]
      },
      {
        method: "POST",
        path: "/oauth/token",
        handler: tokens.create[0]
      }
    ]);
  });
});

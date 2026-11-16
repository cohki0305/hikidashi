import type { SkillDb } from "@/server/db";
import type { OauthAccessTokenRepository } from "@/server/repositories/oauth-access-token-repository";
import type { OauthClientRepository } from "@/server/repositories/oauth-client-repository";
import type { OauthGrantRepository } from "@/server/repositories/oauth-grant-repository";
import type { OauthRequestRepository } from "@/server/repositories/oauth-request-repository";
import type { OauthUsedRefreshTokenRepository } from "@/server/repositories/oauth-used-refresh-token-repository";
export type OAuthServiceDeps = {
  db: SkillDb;
  clients: Pick<OauthClientRepository, "create" | "findById">;
  requests: Pick<
    OauthRequestRepository,
    "create" | "findById" | "approve" | "markDenied" | "findByCodeHash" | "consumeCode"
  >;
  grants: Pick<
    OauthGrantRepository,
    | "create"
    | "findById"
    | "findByRefreshHash"
    | "rotateRefresh"
    | "revoke"
    | "revokeByEmail"
    | "touch"
  >;
  accessTokens: Pick<OauthAccessTokenRepository, "create" | "findLive">;
  usedRefreshTokens: Pick<OauthUsedRefreshTokenRepository, "findGrantId">;
  /** 認可サーバーの案内の issuer と同じ値。戻り先に iss として付ける（RFC 9207） */
  issuer: string;
  now?: () => Date;
};

export type AuthorizeParams = {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
  resource?: string;
};

export type AuthorizationStart =
  | { kind: "pending"; requestId: string }
  | { kind: "unusable" }
  | { kind: "rejected"; redirectTo: string };

export type TokenSet = { accessToken: string; refreshToken: string; expiresIn: number };

export type RequestDescription = {
  clientName: string;
  redirectHost: string;
  status: "pending" | "expired";
};

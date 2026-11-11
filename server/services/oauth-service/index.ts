import type { SkillDb } from "@/server/db";
import { isCodeChallenge, verifyS256 } from "@/server/lib/oauth/pkce";
import { redirectWith } from "@/server/lib/oauth/redirect-uri";
import { generateToken, hashToken } from "@/server/lib/oauth/token";
import { conflict, invalid, notFound, ok, type Result } from "@/server/lib/result";
import type { OauthAccessTokenRepository } from "@/server/repositories/oauth-access-token-repository";
import type { OauthClientRepository } from "@/server/repositories/oauth-client-repository";
import type { OauthGrantRepository } from "@/server/repositories/oauth-grant-repository";
import type { OauthRequestRepository } from "@/server/repositories/oauth-request-repository";
import type { OauthUsedRefreshTokenRepository } from "@/server/repositories/oauth-used-refresh-token-repository";
import { type ClientRegistrationInput, type RegisteredClient, registerClient } from "./register";
import type { AuthorizationStart, AuthorizeParams, RequestDescription, TokenSet } from "./types";

const MINUTE_MS = 60_000;
const REQUEST_TTL_MS = 10 * MINUTE_MS;
const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_MS = 30 * 24 * 60 * MINUTE_MS;

const EXPIRED_MESSAGE = "この画面は期限が切れました。Claude の画面からもう一度つないでください。";
const ALREADY_HANDLED_MESSAGE = "すでに処理されています";
const REQUEST_NOT_FOUND_MESSAGE = "つなぐ頼みが見つかりません";

export type OAuthServiceDeps = {
  db: SkillDb;
  clients: Pick<OauthClientRepository, "create" | "findById">;
  requests: Pick<
    OauthRequestRepository,
    "create" | "findById" | "approve" | "markDenied" | "consumeCode"
  >;
  grants: Pick<
    OauthGrantRepository,
    "create" | "findById" | "findByRefreshHash" | "rotateRefresh" | "revoke" | "touch"
  >;
  accessTokens: Pick<OauthAccessTokenRepository, "create" | "findLive">;
  usedRefreshTokens: Pick<OauthUsedRefreshTokenRepository, "findGrantId">;
  /** 認可サーバーの案内の issuer と同じ値。戻り先に iss として付ける（RFC 9207） */
  issuer: string;
  now?: () => Date;
};

/** RFC 6749 のエラーは message にコード（`invalid_grant` など）を入れて返す。 */
const grantError = () => invalid("invalid_grant");

/** OAuth の認可サーバー。登録・許可・コードの引き換え・トークンの更新を担う。 */
export class OauthService {
  constructor(private readonly deps: OAuthServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** 戻り先へ返す URL。どの戻りにも iss を付ける（RFC 9207） */
  private back(redirectUri: string, params: Record<string, string | null>): string {
    return redirectWith(redirectUri, { ...params, iss: this.deps.issuer });
  }

  /** 連携するアプリを登録する（RFC 7591）。中身は register.ts */
  register(input: ClientRegistrationInput): Promise<Result<RegisteredClient>> {
    return registerClient(this.deps, input);
  }

  async startAuthorization(params: AuthorizeParams): Promise<Result<AuthorizationStart>> {
    let registered: { id: string; redirectUris: string[] } | null = null;
    if (params.clientId) {
      const client = await this.deps.clients.findById(params.clientId);
      if (!client.ok) return client;
      registered = client.value;
    }

    const redirectUri = params.redirectUri;
    // 戻り先を信じてよいのは登録と完全に一致したときだけ。それ以外は戻り先へ送らない
    if (!registered || !redirectUri || !registered.redirectUris.includes(redirectUri))
      return ok({ kind: "unusable" });

    const challenge = params.codeChallenge;
    if (
      params.responseType !== "code" ||
      params.codeChallengeMethod !== "S256" ||
      !challenge ||
      !isCodeChallenge(challenge)
    )
      return ok({
        kind: "rejected",
        redirectTo: this.back(redirectUri, {
          error: "invalid_request",
          state: params.state ?? null
        })
      });

    const request = await this.deps.requests.create({
      clientId: registered.id,
      redirectUri,
      state: params.state ?? null,
      codeChallenge: challenge,
      resource: params.resource ?? null,
      expiresAt: new Date(this.now().getTime() + REQUEST_TTL_MS).toISOString()
    });
    if (!request.ok) return request;
    if (!request.value) return ok({ kind: "unusable" });
    return ok({ kind: "pending", requestId: request.value.id });
  }

  async describeRequest(requestId: string): Promise<Result<RequestDescription>> {
    const request = await this.deps.requests.findById(requestId);
    if (!request.ok) return request;
    if (!request.value) return notFound(REQUEST_NOT_FOUND_MESSAGE);

    const client = await this.deps.clients.findById(request.value.clientId);
    if (!client.ok) return client;
    if (!client.value) return notFound(REQUEST_NOT_FOUND_MESSAGE);

    const redirect = URL.canParse(request.value.redirectUri)
      ? new URL(request.value.redirectUri)
      : null;
    const finished =
      request.value.expiresAt <= this.now().toISOString() ||
      request.value.usedAt !== null ||
      request.value.deniedAt !== null;
    return ok({
      clientName: client.value.clientName,
      redirectHost: redirect?.host ?? "",
      status: finished ? "expired" : "pending"
    });
  }

  async approve(requestId: string, email: string): Promise<Result<{ redirectTo: string }>> {
    const now = this.now();
    const request = await this.deps.requests.findById(requestId);
    if (!request.ok) return request;
    if (!request.value) return notFound(REQUEST_NOT_FOUND_MESSAGE);
    if (request.value.expiresAt <= now.toISOString()) return conflict(EXPIRED_MESSAGE);
    if (
      request.value.email !== null ||
      request.value.usedAt !== null ||
      request.value.deniedAt !== null
    )
      return conflict(ALREADY_HANDLED_MESSAGE);

    const code = generateToken("code");
    const approved = await this.deps.requests.approve(
      requestId,
      { email, codeHash: await hashToken(code) },
      now.toISOString()
    );
    if (!approved.ok) return approved;
    if (!approved.value) return conflict(EXPIRED_MESSAGE);

    return ok({
      redirectTo: this.back(request.value.redirectUri, {
        code,
        state: request.value.state
      })
    });
  }

  async deny(requestId: string): Promise<Result<{ redirectTo: string }>> {
    const now = this.now();
    const denied = await this.deps.requests.markDenied(requestId, now.toISOString());
    if (!denied.ok) return denied;

    const request = await this.deps.requests.findById(requestId);
    if (!request.ok) return request;
    if (!request.value) return notFound(REQUEST_NOT_FOUND_MESSAGE);
    if (!denied.value) {
      return request.value.expiresAt <= now.toISOString()
        ? conflict(EXPIRED_MESSAGE)
        : conflict(ALREADY_HANDLED_MESSAGE);
    }

    return ok({
      redirectTo: this.back(request.value.redirectUri, {
        error: "access_denied",
        state: request.value.state
      })
    });
  }

  /**
   * コードを引き換えて、アクセストークン・refresh・つながりを作る。
   * 失敗はすべて invalid_grant（RFC 6749）。
   */
  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }): Promise<Result<TokenSet>> {
    const now = this.now();
    const codeHash = await hashToken(input.code);
    const consumed = await this.deps.requests.consumeCode(codeHash, now.toISOString());
    if (!consumed.ok) return consumed;
    const request = consumed.value;
    if (!request) return grantError();
    if (
      !request.email ||
      request.expiresAt <= now.toISOString() ||
      request.clientId !== input.clientId ||
      request.redirectUri !== input.redirectUri ||
      !(await verifyS256(input.codeVerifier, request.codeChallenge))
    )
      return grantError();

    const refreshToken = generateToken("refresh");
    const grant = await this.deps.grants.create({
      email: request.email,
      clientId: request.clientId,
      refreshTokenHash: await hashToken(refreshToken),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
      createdAt: now.toISOString()
    });
    if (!grant.ok) return grant;
    if (!grant.value) return grantError();

    const accessToken = generateToken("access");
    const saved = await this.deps.accessTokens.create({
      tokenHash: await hashToken(accessToken),
      grantId: grant.value.id,
      expiresAt: new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString()
    });
    if (!saved.ok) return saved;

    return ok({ accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS });
  }

  /** refresh を回転させる。使い終わった値がもう一度来たら grant ごと取り消す。 */
  async refresh(input: { refreshToken: string; clientId: string }): Promise<Result<TokenSet>> {
    const now = this.now();
    const hash = await hashToken(input.refreshToken);
    const grant = await this.deps.grants.findByRefreshHash(hash);
    if (!grant.ok) return grant;
    if (!grant.value) {
      const reused = await this.deps.usedRefreshTokens.findGrantId(hash);
      if (!reused.ok) return reused;
      if (reused.value) await this.deps.grants.revoke(reused.value, now.toISOString());
      return grantError();
    }
    if (grant.value.revokedAt !== null) return grantError();
    if (grant.value.refreshExpiresAt <= now.toISOString()) return grantError();
    if (grant.value.clientId !== input.clientId) return grantError();

    return this.issue(grant.value.id, hash, now);
  }

  /** refresh を替え、新しい access と合わせて返す。同時の 2 回目は替えられず invalid_grant。 */
  private async issue(
    grantId: string,
    currentRefreshHash: string,
    now: Date
  ): Promise<Result<TokenSet>> {
    const refreshToken = generateToken("refresh");
    const rotated = await this.deps.grants.rotateRefresh(grantId, {
      oldHash: currentRefreshHash,
      newHash: await hashToken(refreshToken),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
      now: now.toISOString()
    });
    if (!rotated.ok) return rotated;
    if (!rotated.value) return grantError();

    const accessToken = generateToken("access");
    const saved = await this.deps.accessTokens.create({
      tokenHash: await hashToken(accessToken),
      grantId,
      expiresAt: new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString()
    });
    if (!saved.ok) return saved;

    return ok({ accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS });
  }

  async authenticate(accessToken: string): Promise<{ email: string } | null> {
    const now = this.now();
    const live = await this.deps.accessTokens.findLive(
      await hashToken(accessToken),
      now.toISOString()
    );
    if (!live.ok) return null;
    if (!live.value) return null;
    await this.deps.grants.touch(live.value.grantId, now.toISOString());
    return { email: live.value.email };
  }
}

// lint:layer-class は dir 名から `OauthService` を要求する。計画の名前 `OAuthService` と両方出す
export { OauthService as OAuthService };

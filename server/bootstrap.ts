import type { SkillDb } from "@/server/db";
import { type AccessVerifier, createAccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { issuerOf } from "@/server/lib/oauth/issuer";
import { type R2S3Config, r2S3ConfigFrom } from "@/server/lib/r2/presign";
import { ok } from "@/server/lib/result";
import { InviteLinkRepository } from "@/server/repositories/invite-link-repository";
import { MemberRepository } from "@/server/repositories/member-repository";
import { OauthAccessTokenRepository } from "@/server/repositories/oauth-access-token-repository";
import { OauthClientRepository } from "@/server/repositories/oauth-client-repository";
import { OauthGrantRepository } from "@/server/repositories/oauth-grant-repository";
import { OauthRequestRepository } from "@/server/repositories/oauth-request-repository";
import { OauthUsedRefreshTokenRepository } from "@/server/repositories/oauth-used-refresh-token-repository";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { createSkillDb, SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import { UploadRepository } from "@/server/repositories/upload-repository";
import { McpService } from "@/server/services/mcp-service";
import { MemberService } from "@/server/services/member-service";
import { OauthService } from "@/server/services/oauth-service";
import { PublishService } from "@/server/services/publish-service";
import { SkillService } from "@/server/services/skill-service";
import { type AppType, createApp } from "./app";

/** Workers の束縛。ASSETS は画面、DB・SKILLS はスキル、ACCESS_* は本人確認に使う。 */
export type BootstrapEnv = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  DB?: D1Database;
  SKILLS?: R2Bucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  APP_ENV?: string;
  DEV_ACCESS_EMAIL?: string;
  CLAUDE_AI_MAX_BYTES?: string;
  /** hikidashi 自身の URL。OAuth と MCP が名乗る issuer になる。 */
  APP_URL?: string;
  /** 常にメンバーとみなす人。カンマ区切り。ここに居る人は外せない。 */
  OWNER_EMAILS?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
};

/** Access の JWT 検証器を環境から組み立てる。設定が無ければ undefined。 */
export function accessVerifierFromEnv(env: BootstrapEnv): AccessVerifier | undefined {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return undefined;
  return createAccessVerifier({
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD
  });
}

function parseMaxBytes(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** 署名の設定は、欠けていれば undefined にする（各 service が fail closed で断る）。 */
function s3ConfigFromEnv(env: BootstrapEnv): R2S3Config | undefined {
  const config = r2S3ConfigFrom(env);
  return config.ok ? config.value : undefined;
}

/** D1・R2 の束縛からスキル API の service を組み立てる。束縛が無ければ undefined。 */
export function skillServiceFromEnv(env: BootstrapEnv): SkillService | undefined {
  if (!env.DB || !env.SKILLS) return undefined;
  const db = createSkillDb(env.DB);
  return new SkillService({
    skills: new SkillRepository(db),
    versions: new SkillVersionRepository(db),
    files: new SkillFileRepository(db),
    bucket: env.SKILLS,
    claudeAiMaxBytes: parseMaxBytes(env.CLAUDE_AI_MAX_BYTES),
    s3: s3ConfigFromEnv(env)
  });
}

/** D1・R2 の束縛から公開・掃除の service を組み立てる。束縛が無ければ undefined。 */
export function publishServiceFromEnv(env: BootstrapEnv): PublishService | undefined {
  if (!env.DB || !env.SKILLS) return undefined;
  const db = createSkillDb(env.DB);
  return new PublishService({
    skills: new SkillRepository(db),
    versions: new SkillVersionRepository(db),
    files: new SkillFileRepository(db),
    uploads: new UploadRepository(db),
    bucket: env.SKILLS,
    s3: s3ConfigFromEnv(env)
  });
}

/** 自分の URL として使える値だけを通す。仮の値や壊れた値なら OAuth と MCP を載せない。 */
export function appUrlFromEnv(env: BootstrapEnv): string | undefined {
  const value = env.APP_URL?.trim();
  if (!value || !URL.canParse(value)) return undefined;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:" ? value : undefined;
}

/** DB の束縛から OAuth の service を組み立てる。 */
export function oauthServiceFromDb(db: SkillDb, appUrl: string): OauthService {
  return new OauthService({
    db,
    clients: new OauthClientRepository(db),
    requests: new OauthRequestRepository(db),
    grants: new OauthGrantRepository(db),
    accessTokens: new OauthAccessTokenRepository(db),
    usedRefreshTokens: new OauthUsedRefreshTokenRepository(db),
    issuer: issuerOf(appUrl)
  });
}

/** 環境の束縛から OAuth の service を組み立てる。DB か APP_URL が無ければ undefined。 */
export function oauthServiceFromEnv(env: BootstrapEnv): OauthService | undefined {
  const appUrl = appUrlFromEnv(env);
  if (!env.DB || !appUrl) return undefined;
  return oauthServiceFromDb(createSkillDb(env.DB), appUrl);
}

/** OWNER_EMAILS を、小文字にそろえた重複なしの一覧にする。空なら誰も入れない。 */
export function ownerEmailsFromEnv(env: BootstrapEnv): string[] {
  const emails = (env.OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  return [...new Set(emails)];
}

/** DB の束縛からメンバーの service を組み立てる。DB が無ければ undefined。 */
export function memberServiceFromEnv(
  env: BootstrapEnv,
  oauth?: Pick<OauthService, "revokeAllFor">
): MemberService | undefined {
  if (!env.DB) return undefined;
  const db = createSkillDb(env.DB);
  return new MemberService({
    members: new MemberRepository(db),
    inviteLinks: new InviteLinkRepository(db),
    revokeGrantsFor: async (email) => (oauth ? oauth.revokeAllFor(email) : ok(undefined)),
    ownerEmails: ownerEmailsFromEnv(env),
    appUrl: appUrlFromEnv(env)
  });
}

/** スキルと OAuth が揃ったときだけ、MCP の service を組み立てる。 */
export function mcpServiceFromEnv(
  oauth: OauthService | undefined,
  skills: SkillService | undefined,
  publish: PublishService | undefined,
  isMember: (email: string) => Promise<boolean>
): McpService | undefined {
  if (!oauth || !skills) return undefined;
  return new McpService({ oauth, skills, install: skills, publish, isMember });
}

/** 依存を組み立てて Hono アプリを返す。束縛はリクエストごとに渡る。 */
export function bootstrap(
  env: BootstrapEnv,
  _waitUntil?: (promise: Promise<unknown>) => void
): AppType {
  const logError = (message: string, context: Record<string, unknown>) =>
    console.error(message, context);
  // ASSETS は entry/worker.ts が直接使う。ここではアプリの組み立てだけを行う。
  void env.ASSETS;
  const skillService = skillServiceFromEnv(env);
  const oauthService = oauthServiceFromEnv(env);
  const publishService = publishServiceFromEnv(env);
  const memberService = memberServiceFromEnv(env, oauthService);
  const isMember = memberService
    ? (email: string) => memberService.isMember(email)
    : async () => false;
  return createApp({
    logError,
    skillService,
    accessVerifier: accessVerifierFromEnv(env),
    oauth: oauthService,
    mcp: mcpServiceFromEnv(oauthService, skillService, publishService, isMember),
    isMember,
    memberService,
    appUrl: appUrlFromEnv(env)
  });
}

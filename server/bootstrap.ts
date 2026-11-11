import { type AccessVerifier, createAccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { type R2S3Config, r2S3ConfigFrom } from "@/server/lib/r2/presign";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { createSkillDb, SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import { UploadRepository } from "@/server/repositories/upload-repository";
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

/** 依存を組み立てて Hono アプリを返す。束縛はリクエストごとに渡る。 */
export function bootstrap(
  env: BootstrapEnv,
  _waitUntil?: (promise: Promise<unknown>) => void
): AppType {
  const logError = (message: string, context: Record<string, unknown>) =>
    console.error(message, context);
  // ASSETS は entry/worker.ts が直接使う。ここではアプリの組み立てだけを行う。
  void env.ASSETS;
  return createApp({
    logError,
    skillService: skillServiceFromEnv(env),
    accessVerifier: accessVerifierFromEnv(env)
  });
}

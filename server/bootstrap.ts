import { type AccessVerifier, createAccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { createSkillDb, SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
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

/** D1・R2 の束縛からスキル API の service を組み立てる。束縛が無ければ undefined。 */
export function skillServiceFromEnv(env: BootstrapEnv): SkillService | undefined {
  if (!env.DB || !env.SKILLS) return undefined;
  const db = createSkillDb(env.DB);
  return new SkillService({
    skills: new SkillRepository(db),
    versions: new SkillVersionRepository(db),
    files: new SkillFileRepository(db),
    bucket: env.SKILLS,
    claudeAiMaxBytes: parseMaxBytes(env.CLAUDE_AI_MAX_BYTES)
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

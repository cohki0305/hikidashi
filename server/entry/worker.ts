import { type BootstrapEnv, bootstrap, publishServiceFromEnv } from "@/server/bootstrap";
import { isAppPath, servePage } from "./pages";

type CleanupService = { cleanupExpired(now: Date): Promise<{ expired: number }> };

/** 期限切れの受け皿を掃除する。束縛が無ければ何もしない。 */
export async function runScheduled(
  env: BootstrapEnv,
  now: Date,
  serviceFromEnv: (env: BootstrapEnv) => CleanupService | undefined = publishServiceFromEnv
): Promise<void> {
  const service = serviceFromEnv(env);
  if (!service) return;
  await service.cleanupExpired(now);
}

export default {
  fetch: (request, env, ctx) => {
    const { pathname } = new URL(request.url);
    const readsPage = request.method === "GET" || request.method === "HEAD";
    // 画面とファイルは配る元から返し、画面の無い道は 404 にする。アプリの道は Hono へ
    if (env.ASSETS && readsPage && !isAppPath(pathname)) return servePage(request, env.ASSETS);
    return bootstrap(env, (promise) => ctx.waitUntil(promise)).fetch(request);
  },
  // Cron で期限切れの受け皿を掃除する。D1・R2 が無ければ何もしない。
  scheduled: async (_controller, env) => {
    await runScheduled(env, new Date());
  }
} satisfies ExportedHandler<BootstrapEnv>;

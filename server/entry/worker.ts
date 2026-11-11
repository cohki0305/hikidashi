import { type BootstrapEnv, bootstrap } from "@/server/bootstrap";
import { isAppPath, servePage } from "./pages";

export default {
  fetch: (request, env, ctx) => {
    const { pathname } = new URL(request.url);
    const readsPage = request.method === "GET" || request.method === "HEAD";
    // 画面とファイルは配る元から返し、画面の無い道は 404 にする。アプリの道は Hono へ
    if (env.ASSETS && readsPage && !isAppPath(pathname)) return servePage(request, env.ASSETS);
    return bootstrap(env, (promise) => ctx.waitUntil(promise)).fetch(request);
  }
} satisfies ExportedHandler<BootstrapEnv>;

import { Hono } from "hono";
import { healthRoutes } from "@/server/api/health";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";

export type AppDeps = {
  logError: (message: string, context: Record<string, unknown>) => void;
};

export function createApp(deps: AppDeps) {
  const app = new Hono({ strict: false })
    .onError((err, c) => {
      // 例外の本文は個人情報を含みうるため、応答にもログにも出さない（種類だけ）
      deps.logError("unhandled", { errorName: err.name });
      return c.json({ error: "Internal server error" }, 500);
    })
    .route("/api", healthRoutes);
  return app.notFound((c) => failure(c, notFound("Not found")));
}

export type AppType = ReturnType<typeof createApp>;

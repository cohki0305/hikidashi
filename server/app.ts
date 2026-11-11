import { Hono } from "hono";
import { healthRoutes } from "@/server/api/health";
import { meRoutes } from "@/server/api/protected/me";
import { createSkillRoutes, type SkillServicePort } from "@/server/api/protected/skills";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { failure } from "@/server/lib/http";
import { forbidden, notFound } from "@/server/lib/result";
import { requireAccess } from "@/server/middleware/require-access";

export type AppDeps = {
  logError: (message: string, context: Record<string, unknown>) => void;
  /** スキル API の service。bootstrap が D1・R2 から組み立てて渡す。 */
  skillService?: SkillServicePort;
  /** Access の JWT 検証器。無ければ保護した入口をすべて 401 にする。 */
  accessVerifier?: AccessVerifier;
};

const denyAccess: AccessVerifier = async () => forbidden("Access の検証器が設定されていません");

export function createApp(deps: AppDeps) {
  const verifyAccess = requireAccess(deps.accessVerifier ?? denyAccess);
  const app = new Hono({ strict: false })
    .onError((err, c) => {
      // 例外の本文は個人情報を含みうるため、応答にもログにも出さない（種類だけ）
      deps.logError("unhandled", { errorName: err.name });
      return c.json({ error: "Internal server error" }, 500);
    })
    .route("/api", healthRoutes)
    // 健康確認の後に一括で本人確認を張る。新しく足す /api の道も自動で保護される（fail closed）
    .use("/api/*", verifyAccess)
    .route("/api", createSkillRoutes(deps.skillService))
    .route("/api", meRoutes);
  return app.notFound((c) => failure(c, notFound("Not found")));
}

export type AppType = ReturnType<typeof createApp>;

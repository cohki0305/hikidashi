import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { healthRoutes } from "@/server/api/health";
import { createMcpRoutes, type McpServicePort } from "@/server/api/mcp";
import { createOAuthRoutes, type OAuthServicePort } from "@/server/api/oauth";
import { createInviteRoutes, type MemberServicePort } from "@/server/api/protected/invites";
import { meRoutes } from "@/server/api/protected/me";
import { createMemberRoutes } from "@/server/api/protected/members";
import {
  createOAuthRequestRoutes,
  type OAuthRequestServicePort
} from "@/server/api/protected/oauth-requests";
import { createSkillRoutes, type SkillServicePort } from "@/server/api/protected/skills";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { failure } from "@/server/lib/http";
import { forbidden, notFound } from "@/server/lib/result";
import { requireAccess } from "@/server/middleware/require-access";
import { requireMember } from "@/server/middleware/require-member";

export type AppDeps = {
  logError: (message: string, context: Record<string, unknown>) => void;
  /** スキル API の service。bootstrap が D1・R2 から組み立てて渡す。 */
  skillService?: SkillServicePort;
  /** Access の JWT 検証器。無ければ保護した入口をすべて 401 にする。 */
  accessVerifier?: AccessVerifier;
  /** OAuth の Service。APP_URL と揃って初めて OAuth の入口を載せる。 */
  oauth?: Partial<OAuthServicePort & OAuthRequestServicePort>;
  /** MCP の Service。APP_URL と揃って初めて MCP の入口を載せる。 */
  mcp?: Partial<McpServicePort>;
  /** メンバー判定。無ければ誰もメンバーでない（fail closed）。 */
  isMember?: (email: string) => Promise<boolean>;
  /** 招待リンクの引き換え。無ければ入口を 404 で塞ぐ。 */
  memberService?: MemberServicePort;
  /** 認可サーバーの issuer。無ければ OAuth と MCP の入口を載せない（fail closed）。 */
  appUrl?: string;
};

const denyAccess: AccessVerifier = async () => forbidden("Access の検証器が設定されていません");

/** メンバーでなくても通す道。本人確認そのものと、招待を使うところだけ。 */
const MEMBER_EXEMPT_PATHS: ReadonlySet<string> = new Set(["/api/me", "/api/invites/redemptions"]);

export function createApp(deps: AppDeps) {
  const verifyAccess = requireAccess(deps.accessVerifier ?? denyAccess);
  const isMember = deps.isMember ?? (async () => false);
  const memberOnly = requireMember(isMember);
  const memberUnlessExempt = createMiddleware(async (c, next) => {
    const pathname = new URL(c.req.url).pathname.replace(/\/+$/, "") || "/";
    if (MEMBER_EXEMPT_PATHS.has(pathname)) return next();
    return memberOnly(c, next);
  });
  const app = new Hono({ strict: false })
    .onError((err, c) => {
      // 例外の本文は個人情報を含みうるため、応答にもログにも出さない（種類だけ）
      deps.logError("unhandled", { errorName: err.name });
      return c.json({ error: "Internal server error" }, 500);
    })
    .route("/api", healthRoutes)
    // 健康確認の後に一括で本人確認を張る。新しく足す /api の道も自動で保護される（fail closed）
    .use("/api/*", verifyAccess)
    // 本人確認の後は、メンバーでない人を一括で止める
    .use("/api/*", memberUnlessExempt)
    .use("/api/me", async (c, next) => {
      c.set("isMember", isMember);
      await next();
    })
    .route("/api", createSkillRoutes(deps.skillService))
    .route("/api", createMemberRoutes(deps.memberService))
    .route("/api", meRoutes)
    .route("/api/invites", createInviteRoutes(deps.memberService))
    .route("/api/oauth-requests", createOAuthRequestRoutes(deps.oauth))
    .route(
      "/",
      createOAuthRoutes({
        oauth: deps.oauth,
        appUrl: deps.appUrl,
        verifyAccess,
        verifyMember: memberOnly
      })
    )
    .route("/", createMcpRoutes({ mcp: deps.mcp, appUrl: deps.appUrl }));
  return app.notFound((c) => failure(c, notFound("Not found")));
}

export type AppType = ReturnType<typeof createApp>;

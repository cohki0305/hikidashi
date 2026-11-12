import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";

/** 本人確認に使う環境の束縛。 */
export type AccessEnv = {
  APP_ENV?: string;
  DEV_ACCESS_EMAIL?: string;
};

declare module "hono" {
  interface ContextVariableMap {
    email: string;
  }
}

const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/api/health"]);

function unauthorized(c: Context<{ Bindings: AccessEnv }>) {
  return c.json({ error: "Unauthorized" }, 401);
}

/**
 * Cloudflare Access の JWT を検証し、本人のメールアドレスを `c.var.email` に入れる。
 * 手元の開発（APP_ENV=development）だけ DEV_ACCESS_EMAIL を本人として通す。
 */
export function requireAccess(verify: AccessVerifier) {
  return createMiddleware<{ Bindings: AccessEnv }>(async (c, next) => {
    const { pathname } = new URL(c.req.url);
    if (PUBLIC_PATHS.has(pathname)) return next();

    const env: AccessEnv = c.env ?? {};
    if (env.APP_ENV === "development" && env.DEV_ACCESS_EMAIL) {
      c.set("email", env.DEV_ACCESS_EMAIL.toLowerCase());
      return next();
    }

    const jwt = c.req.header("Cf-Access-Jwt-Assertion");
    if (!jwt) return unauthorized(c);

    const result = await verify(jwt);
    if (!result.ok) return unauthorized(c);

    c.set("email", result.value.email.toLowerCase());
    return next();
  });
}

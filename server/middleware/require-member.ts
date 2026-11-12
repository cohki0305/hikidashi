import { createMiddleware } from "hono/factory";

/** そのメールアドレスが今もメンバーかを確かめる関数。 */
export type MemberLookup = (email: string) => Promise<boolean>;

declare module "hono" {
  interface ContextVariableMap {
    /** リクエストのたびに使うメンバー判定。`/api/me` の応答にも使う。 */
    isMember: MemberLookup;
  }
}

/**
 * 本人確認を通った人がメンバーかを確かめる。メンバーでなければ 403 `not_member`。
 * 業務層には依存せず、判定は呼び出し側が注入する。
 */
export function requireMember(isMember: MemberLookup) {
  return createMiddleware(async (c, next) => {
    const email = c.var.email;
    if (!email || !(await isMember(email))) return c.json({ error: "not_member" }, 403);
    await next();
  });
}

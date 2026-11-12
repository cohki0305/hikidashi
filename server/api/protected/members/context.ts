import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import type { MemberService } from "@/server/services/member-service";

/** メンバーと招待の入口が使う Service の口。実体は bootstrap が組み立てて注入する。 */
export type MemberServicePort = Pick<
  MemberService,
  "list" | "remove" | "redeem" | "createInvite" | "listInvites" | "revokeInvite"
>;

export type MembersEnv = { Variables: { memberService: MemberServicePort } };

/** Service を c.var に載せる。無ければ入口を塞ぐ（fail closed）。 */
export function provideMemberService(service?: MemberServicePort) {
  return createMiddleware<MembersEnv>(async (c, next) => {
    if (!service) return failure(c, notFound("Not found"));
    c.set("memberService", service);
    await next();
  });
}

/** zValidator の検証失敗を 404 に写す（存在しない資源として扱う）。 */
export function notFoundOnInvalid(result: { success: boolean }, c: Context) {
  if (result.success) return;
  return failure(c, notFound("入力が正しくありません"));
}

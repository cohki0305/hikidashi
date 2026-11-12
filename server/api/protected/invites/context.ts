import { createMiddleware } from "hono/factory";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import type { MemberService } from "@/server/services/member-service";

/** 招待の入口が使う Service の口。実体は bootstrap が組み立てて注入する。 */
export type MemberServicePort = Pick<
  MemberService,
  "redeem" | "createInvite" | "listInvites" | "revokeInvite" | "list" | "remove"
>;

export type InvitesEnv = { Variables: { memberService: MemberServicePort } };

/** Service を c.var に載せる。無ければ入口を塞ぐ（fail closed）。 */
export function provideMemberService(service?: MemberServicePort) {
  return createMiddleware<InvitesEnv>(async (c, next) => {
    if (!service) return failure(c, notFound("Not found"));
    c.set("memberService", service);
    await next();
  });
}

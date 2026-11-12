import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { type MembersEnv, notFoundOnInvalid } from "@/server/api/protected/members/context";
import { failure, ok } from "@/server/lib/http";
import type { MembersResponse } from "@/shared/schemas/members";
import { memberEmailParamsSchema } from "@/shared/schemas/members/request/member";

const factory = createFactory<MembersEnv>();

/** 有効なメンバーの一覧。自分かどうかを添えて、入った日の新しい順に返す。 */
export const index = factory.createHandlers(async (c) => {
  const result = await c.get("memberService").list(c.var.email);
  if (!result.ok) return failure(c, result);
  const email = c.var.email.toLowerCase();
  const body: MembersResponse = {
    members: result.value.map((member) => ({ ...member, isMe: member.email === email }))
  };
  return ok(c, body);
});

/** メンバーを外す。オーナーと自分は外せない。 */
export const destroy = factory.createHandlers(
  zValidator("param", memberEmailParamsSchema, notFoundOnInvalid),
  async (c) => {
    const result = await c.get("memberService").remove(c.var.email, c.req.valid("param").email);
    if (!result.ok) return failure(c, result);
    return ok(c, { ok: true });
  }
);

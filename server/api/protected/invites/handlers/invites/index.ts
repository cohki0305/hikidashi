import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import type { InvitesEnv } from "@/server/api/protected/invites/context";
import { failure, ok } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import type { CreatedInvite, InvitesResponse } from "@/shared/schemas/members";
import { inviteIdParamsSchema } from "@/shared/schemas/members/request/invite";

const factory = createFactory<InvitesEnv>();

/** 自分が作った、まだ使える招待リンクの一覧。鍵と url は返さない。 */
export const index = factory.createHandlers(async (c) => {
  const result = await c.get("memberService").listInvites(c.var.email);
  if (!result.ok) return failure(c, result);
  const body: InvitesResponse = { invites: result.value };
  return ok(c, body);
});

/** 新しい招待リンクを作る。url を返すのはこの応答だけ。 */
export const create = factory.createHandlers(async (c) => {
  const result = await c.get("memberService").createInvite(c.var.email);
  if (!result.ok) return failure(c, result);
  const body: CreatedInvite = result.value;
  return ok(c, body);
});

/** 招待リンクを止める。作った人でなくてもメンバーなら止められる。 */
export const destroy = factory.createHandlers(
  zValidator("param", inviteIdParamsSchema, (result, c) => {
    if (!result.success) return failure(c, notFound("このリンクは見つかりません"));
  }),
  async (c) => {
    const result = await c.get("memberService").revokeInvite(c.var.email, c.req.valid("param").id);
    if (!result.ok) return failure(c, result);
    return ok(c, { ok: true });
  }
);

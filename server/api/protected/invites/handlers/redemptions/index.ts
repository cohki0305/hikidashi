import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import type { InvitesEnv } from "@/server/api/protected/invites/context";
import { failure, ok } from "@/server/lib/http";
import { invalid } from "@/server/lib/result";
import { joinInviteRequestSchema } from "@/shared/schemas/members/request/invite";

const factory = createFactory<InvitesEnv>();

/** 招待リンクの鍵を使い、開いた人をメンバーにする。 */
export const create = factory.createHandlers(
  zValidator("json", joinInviteRequestSchema, (result, c) => {
    if (!result.success) return failure(c, invalid("入力が正しくありません"));
  }),
  async (c) => {
    const { key } = c.req.valid("json");
    const redeemed = await c.get("memberService").redeem(c.var.email, key);
    if (!redeemed.ok) return failure(c, redeemed);
    return ok(c, redeemed.value);
  }
);

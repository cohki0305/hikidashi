import { z } from "zod";

/** メンバー一覧に出す 1 人分。 */
export const memberSchema = z.object({
  email: z.email(),
  joinedAt: z.iso.datetime(),
  isOwner: z.boolean()
});
export type MemberItem = z.infer<typeof memberSchema>;

/** 画面に出す 1 人分。自分かどうかを足す。 */
export const memberViewSchema = memberSchema.extend({
  isMe: z.boolean()
});
export type MemberView = z.infer<typeof memberViewSchema>;

/** メンバー一覧の応答。joinedAt の新しい順。 */
export const membersResponseSchema = z.object({
  members: z.array(memberViewSchema)
});
export type MembersResponse = z.infer<typeof membersResponseSchema>;

/** 招待リンクを作ったときの応答。url はこのときだけ返す。 */
export const createdInviteSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  expiresAt: z.iso.datetime()
});
export type CreatedInvite = z.infer<typeof createdInviteSchema>;

/** 有効な招待リンク 1 本。鍵と url は含めない。 */
export const inviteItemSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime()
});
export type InviteItem = z.infer<typeof inviteItemSchema>;

/** 自分が作った有効な招待リンクの一覧。 */
export const invitesResponseSchema = z.object({
  invites: z.array(inviteItemSchema)
});
export type InvitesResponse = z.infer<typeof invitesResponseSchema>;

export type {
  InviteIdParams,
  JoinInviteRequest,
  JoinInviteRequest as RedeemInviteRequest
} from "./members/request/invite";
/** 招待リンクを使うときの入力。 */
export {
  inviteIdParamsSchema,
  joinInviteRequestSchema,
  joinInviteRequestSchema as redeemInviteRequestSchema
} from "./members/request/invite";
export type { MemberEmailParams } from "./members/request/member";
export { memberEmailParamsSchema } from "./members/request/member";

/** 招待リンクを使った結果。joined は今回入れたら true。 */
export const redeemInviteResponseSchema = z.object({
  joined: z.boolean()
});
export type RedeemInviteResponse = z.infer<typeof redeemInviteResponseSchema>;

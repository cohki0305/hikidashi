import { z } from "zod";

/** 招待リンクを使うときの入力。 */
export const joinInviteRequestSchema = z.object({
  key: z.string().min(1)
});
export type JoinInviteRequest = z.infer<typeof joinInviteRequestSchema>;

/** 止める招待リンクの id。 */
export const inviteIdParamsSchema = z.object({
  id: z.string().min(1)
});
export type InviteIdParams = z.infer<typeof inviteIdParamsSchema>;

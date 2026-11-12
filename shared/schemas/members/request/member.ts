import { z } from "zod";

/** 外す相手のメールアドレス。 */
export const memberEmailParamsSchema = z.object({
  email: z.email()
});
export type MemberEmailParams = z.infer<typeof memberEmailParamsSchema>;

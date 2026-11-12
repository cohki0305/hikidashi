import { z } from "zod";

/** GET /api/me の応答。ログイン中のメールアドレスと、メンバーかどうか。 */
export const meResponseSchema = z.object({
  email: z.email(),
  isMember: z.boolean()
});
export type MeResponse = z.infer<typeof meResponseSchema>;

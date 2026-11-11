import { z } from "zod";

/** GET /api/me の応答。ログイン中のメールアドレス。 */
export const meResponseSchema = z.object({
  email: z.email()
});
export type MeResponse = z.infer<typeof meResponseSchema>;

import { z } from "zod";

/** 許可の頼みの状態。`expired` は期限切れ・使い済み・拒否済みをまとめたもの。 */
export const oauthRequestStatusSchema = z.enum(["pending", "expired"]);

/** GET /api/oauth-requests/:id の応答。許可の画面に出す相手と状態。 */
export const oauthRequestResponseSchema = z.object({
  clientName: z.string(),
  redirectHost: z.string(),
  status: oauthRequestStatusSchema
});
export type OAuthRequestResponse = z.infer<typeof oauthRequestResponseSchema>;

/** 許可・やめるの応答。画面はこの戻り先へ移る。 */
export const oauthRedirectResponseSchema = z.object({
  redirectTo: z.string()
});
export type OAuthRedirectResponse = z.infer<typeof oauthRedirectResponseSchema>;

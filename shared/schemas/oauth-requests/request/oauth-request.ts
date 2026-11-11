import { z } from "zod";

/** 許可の頼みの id。uuid の形だけを受ける。 */
export const oauthRequestIdParamsSchema = z.object({
  id: z.uuid()
});

import { type McpTool, MISSING_CONFIG_MESSAGE } from "@/server/lib/mcp/json-rpc";
import { ok, upstream } from "@/server/lib/result";
import { type FinishPublishInput, finishPublishInputSchema } from "@/shared/schemas/mcp";

/** begin_publish で送った zip を検査して、新しい版として公開する。 */
export const finishPublishTool: McpTool<FinishPublishInput> = {
  name: "finish_publish",
  description:
    "begin_publish で送った zip を検査して、新しい版として公開します。中身が最新版と同じなら版は増えず、変更なしと返します。公開できたら、名前と版を利用者に伝え、手元の .hikidashi.json を新しい版と指紋に書き換えてください。",
  input: finishPublishInputSchema,
  async call(ctx, input) {
    if (ctx.publish === undefined) return upstream(MISSING_CONFIG_MESSAGE);

    const result = await ctx.publish.finish(ctx.email, input.uploadId, input.note);
    if (!result.ok) {
      if (
        result.details?.missingConfig === true ||
        result.message === "R2 の S3 の設定が足りません"
      )
        return upstream(MISSING_CONFIG_MESSAGE);
      return result;
    }

    return ok(result.value);
  }
};

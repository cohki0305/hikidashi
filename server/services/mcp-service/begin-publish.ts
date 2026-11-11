import {
  type McpTool,
  MISSING_CONFIG_MESSAGE,
  type PublishTicket
} from "@/server/lib/mcp/json-rpc";
import { ok, upstream } from "@/server/lib/result";
import { type BeginPublishInput, beginPublishInputSchema } from "@/shared/schemas/mcp";

function stepsFor(ticket: PublishTicket): string {
  return `1. スキルのフォルダ（直下に SKILL.md がある）を zip にする（例: cd <フォルダ> && zip -r /tmp/<name>.zip . -x '.hikidashi.json'）。2. curl -fsS -T /tmp/<name>.zip '${ticket.uploadUrl}' で送る（30 分以内、${ticket.maxBytes} バイトまで）。3. finish_publish に uploadId '${ticket.uploadId}' を渡す。`;
}

/** スキルを公開するための、30 分だけ使えるアップロード先を作る。 */
export const beginPublishTool: McpTool<BeginPublishInput> = {
  name: "begin_publish",
  description:
    "Claude Code 専用です。スキルを公開するための、30 分だけ使えるアップロード先を作ります。返ってきた steps の手順で zip を送り、最後に finish_publish を呼んでください。",
  input: beginPublishInputSchema,
  async call(ctx) {
    if (ctx.publish === undefined) return upstream(MISSING_CONFIG_MESSAGE);

    const result = await ctx.publish.begin(ctx.email);
    if (!result.ok) {
      if (
        result.details?.missingConfig === true ||
        result.message === "R2 の S3 の設定が足りません"
      )
        return upstream(MISSING_CONFIG_MESSAGE);
      return result;
    }

    return ok({ ...result.value, steps: stepsFor(result.value) });
  }
};

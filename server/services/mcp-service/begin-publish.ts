import {
  type McpTool,
  MISSING_CONFIG_MESSAGE,
  type PublishTicket
} from "@/server/lib/mcp/json-rpc";
import { ok, upstream } from "@/server/lib/result";
import { type BeginPublishInput, beginPublishInputSchema } from "@/shared/schemas/mcp";
import { toMissingConfig } from "./missing-config";

function stepsFor(ticket: PublishTicket): string {
  return `1. サイズを確認した同じ zip を curl -fsS -T /tmp/<name>.zip '${ticket.uploadUrl}' で送る（30 分以内、${ticket.maxBytes} バイトまで）。2. finish_publish に uploadId '${ticket.uploadId}' を渡す。`;
}

/** スキルを公開するための、30 分だけ使えるアップロード先を作る。 */
export const beginPublishTool: McpTool<BeginPublishInput> = {
  name: "begin_publish",
  description:
    "Claude Code 専用です。公開するスキルのフォルダを丸ごと zip にしてください。フォルダ内のファイルは .gitignore で無視されているものと .hikidashi.json を除いてすべて含め、SKILL.md は zip の直下に置いてください。できた zip を wc -c で測ったバイト数を sizeBytes に渡してください。スキルを公開するための、30 分だけ使えるアップロード先を作ります。返ってきた steps の手順で zip を送り、最後に finish_publish を呼んでください。",
  input: beginPublishInputSchema,
  async call(ctx, input) {
    if (ctx.publish === undefined) return upstream(MISSING_CONFIG_MESSAGE);

    const result = await ctx.publish.begin(ctx.email, input.sizeBytes);
    if (!result.ok) return toMissingConfig(result) ?? result;

    return ok({ ...result.value, steps: stepsFor(result.value) });
  }
};

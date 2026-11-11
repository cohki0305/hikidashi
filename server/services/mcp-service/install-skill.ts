import type { InstallInfo, McpTool } from "@/server/lib/mcp/json-rpc";
import { ok } from "@/server/lib/result";
import { type InstallSkillInput, installSkillInputSchema } from "@/shared/schemas/mcp";
import { toMissingConfig } from "./missing-config";

const CLAUDE_AI_STEP =
  "claude.ai では、downloadUrl を利用者に渡し、zip を保存して『設定 › 機能 › スキル』からアップロードしてもらう。";

const CLAUDE_CODE_ONLY_STEP = "このスキルは大きいので Claude Code でだけ使えます。";

function stepsFor(info: InstallInfo): string {
  const steps = [
    `1. downloadUrl から zip を取得する（例: curl -fsSL -o /tmp/${info.name}.zip '${info.downloadUrl}'）。`,
    `2. ~/.claude/skills/${info.name}/ に展開する（例: mkdir -p ~/.claude/skills/${info.name} && unzip -o /tmp/${info.name}.zip -d ~/.claude/skills/${info.name}）。zip の一番上にフォルダが 1 つだけあるときは、その中身を ~/.claude/skills/${info.name}/ の直下に置く。`,
    `3. ~/.claude/skills/${info.name}/.hikidashi.json に marker を JSON で書く。`
  ].join("");
  return `${steps}\n${info.claudeCodeOnly ? CLAUDE_CODE_ONLY_STEP : CLAUDE_AI_STEP}`;
}

/** チームのスキルを手元に入れるための、10 分だけ使えるダウンロード URL を返す。 */
export const installSkillTool: McpTool<InstallSkillInput> = {
  name: "install_skill",
  description:
    "チームのスキルを手元に入れるための、10 分だけ使えるダウンロード URL を返します。返ってきた steps の手順に従ってください。手元に同じスキルがあるときは、入れ直してよいか利用者に確かめてから置き換えてください。",
  input: installSkillInputSchema,
  async call(ctx, input) {
    const result = await ctx.install.installInfo(input.name, input.version);
    if (!result.ok) return toMissingConfig(result) ?? result;

    const info = result.value;
    return ok({
      name: info.name,
      version: info.version,
      fingerprint: info.fingerprint,
      sizeBytes: info.sizeBytes,
      claudeCodeOnly: info.claudeCodeOnly,
      downloadUrl: info.downloadUrl,
      expiresInSeconds: info.expiresInSeconds,
      marker: {
        name: info.name,
        version: info.version,
        fingerprint: info.fingerprint
      },
      steps: stepsFor(info)
    });
  }
};

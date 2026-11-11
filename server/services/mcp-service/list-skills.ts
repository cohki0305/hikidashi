import type { McpTool } from "@/server/lib/mcp/json-rpc";
import { ok } from "@/server/lib/result";
import { type ListSkillsInput, listSkillsInputSchema } from "@/shared/schemas/mcp";

/** チームで共有しているスキルを、探す言葉で絞って返す。 */
export const listSkillsTool: McpTool<ListSkillsInput> = {
  name: "list_skills",
  description:
    "チームで共有しているスキルを探します。query に言葉を入れると、名前と説明で絞り込みます。",
  input: listSkillsInputSchema,
  async call(ctx, input) {
    const result = await ctx.skills.list(input.query ?? "");
    if (!result.ok) return result;
    return ok({
      skills: result.value.map((skill) => ({
        name: skill.name,
        title: skill.title,
        description: skill.description,
        latestVersion: skill.latestVersion,
        updatedAt: skill.updatedAt,
        claudeCodeOnly: skill.claudeCodeOnly
      }))
    });
  }
};

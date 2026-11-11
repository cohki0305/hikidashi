import type { McpTool } from "@/server/lib/mcp/json-rpc";
import { ok } from "@/server/lib/result";
import { type CheckSkillUpdatesInput, checkSkillUpdatesInputSchema } from "@/shared/schemas/mcp";

type UpdateResult = {
  name: string;
  status: "up_to_date" | "update_available" | "not_found";
  installedVersion: number;
  latestVersion?: number;
};

/** 手元の目印と最新版の指紋を比べる。版番号が違っても、中身が同じなら最新とみなす。 */
export const checkSkillUpdatesTool: McpTool<CheckSkillUpdatesInput> = {
  name: "check_skill_updates",
  description:
    "手元に入れたスキルに新しい版があるかを確かめます。~/.claude/skills/*/.hikidashi.json の name・version・fingerprint を並べて渡してください。更新があっても勝手に上書きせず、利用者の同意を得てください。",
  input: checkSkillUpdatesInputSchema,
  async call(ctx, input) {
    const latest = await ctx.skills.latestByNames(input.installed.map((item) => item.name));
    if (!latest.ok) return latest;

    const byName = new Map(latest.value.map((item) => [item.name, item]));
    const results: UpdateResult[] = input.installed.map((installed): UpdateResult => {
      const found = byName.get(installed.name);
      if (found === undefined)
        return {
          name: installed.name,
          status: "not_found",
          installedVersion: installed.version
        };
      return {
        name: installed.name,
        status: found.fingerprint === installed.fingerprint ? "up_to_date" : "update_available",
        installedVersion: installed.version,
        latestVersion: found.latestVersion
      };
    });
    return ok({ results });
  }
};

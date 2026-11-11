import type { McpTool, McpToolContext, SkillCatalog } from "@/server/lib/mcp/json-rpc";
import { notFound, ok } from "@/server/lib/result";
import { type CheckSkillUpdatesInput, checkSkillUpdatesInputSchema } from "@/shared/schemas/mcp";

/** 呼び出しのときに McpService が載せた、スキルを読む口を取り出す。 */
const catalogOf = (ctx: { email: string }): SkillCatalog => (ctx as McpToolContext).skills;

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
    const skills = catalogOf(ctx);
    const results: UpdateResult[] = [];
    for (const installed of input.installed) {
      const detail = await skills.show(installed.name);
      if (!detail.ok) {
        if (detail.kind !== "not_found") return detail;
        results.push({
          name: installed.name,
          status: "not_found",
          installedVersion: installed.version
        });
        continue;
      }
      const { skill, versions } = detail.value;
      const latest =
        versions.find((version) => version.version === skill.latestVersion) ?? versions[0];
      if (latest === undefined) return notFound("スキルの版が見つかりません");
      results.push({
        name: installed.name,
        status: latest.fingerprint === installed.fingerprint ? "up_to_date" : "update_available",
        installedVersion: installed.version,
        latestVersion: latest.version
      });
    }
    return ok({ results });
  }
};

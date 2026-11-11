import type { McpTool } from "@/server/lib/mcp/json-rpc";
import { beginPublishTool } from "./begin-publish";
import { checkSkillUpdatesTool } from "./check-skill-updates";
import { finishPublishTool } from "./finish-publish";
import { installSkillTool } from "./install-skill";
import { listSkillsTool } from "./list-skills";

export type {
  McpTool,
  McpToolContext,
  SkillCatalog
} from "@/server/lib/mcp/json-rpc";

/** 後の issue で足すときは、この配列に 1 つ足すだけで一覧と実行の両方に載る。 */
export const MCP_TOOLS: McpTool<unknown>[] = [
  listSkillsTool,
  checkSkillUpdatesTool,
  installSkillTool,
  beginPublishTool,
  finishPublishTool
];

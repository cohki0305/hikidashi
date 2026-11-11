import { createFactory } from "hono/factory";
import type { SkillsEnv } from "@/server/api/protected/skills/context";
import * as skillVersionDownloads from "@/server/api/protected/skills/handlers/skill-version-downloads";
import * as skillVersionFiles from "@/server/api/protected/skills/handlers/skill-version-files";
import * as skills from "@/server/api/protected/skills/handlers/skills";

const factory = createFactory<SkillsEnv>();

export const skillRoutes = factory
  .createApp()
  .get("/skills", ...skills.index)
  .get("/skills/:skillName", ...skills.show)
  .get("/skills/:skillName/versions/:version/files", ...skillVersionFiles.index)
  .get("/skills/:skillName/versions/:version/download", ...skillVersionDownloads.index);

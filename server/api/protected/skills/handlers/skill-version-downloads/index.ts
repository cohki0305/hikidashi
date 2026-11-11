import { createFactory } from "hono/factory";
import type { SkillsEnv } from "@/server/api/protected/skills/context";
import { okDownload, versionedSkillParams } from "@/server/api/protected/skills/context";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import { skillNameSchema } from "@/shared/schemas/skills";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(async (c) => {
  const params = versionedSkillParams(c.req.path);
  if (params === null || !skillNameSchema.safeParse(params.name).success)
    return failure(c, notFound("スキルの版が見つかりません"));

  const result = await c.get("skillService").download(params.name, params.version);
  return result.ok ? okDownload(c, result.value) : failure(c, result);
});

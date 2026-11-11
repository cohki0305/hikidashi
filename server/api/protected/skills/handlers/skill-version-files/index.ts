import { createFactory } from "hono/factory";
import type { SkillsEnv } from "@/server/api/protected/skills/context";
import {
  isSafePreviewPath,
  okText,
  versionedSkillParams
} from "@/server/api/protected/skills/context";
import { failure } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import { skillNameSchema } from "@/shared/schemas/skills";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(async (c) => {
  const params = versionedSkillParams(c.req.path);
  const path = c.req.query("path");
  if (
    params === null ||
    !skillNameSchema.safeParse(params.name).success ||
    path === undefined ||
    !isSafePreviewPath(path)
  )
    return failure(c, notFound("プレビューできるファイルではありません"));

  const result = await c.get("skillService").preview(params.name, params.version, path);
  return result.ok ? okText(c, result.value) : failure(c, result);
});

import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { notFoundOnInvalid, type SkillsEnv } from "@/server/api/protected/skills/context";
import { failure, text } from "@/server/lib/http";
import {
  previewQuerySchema,
  skillVersionParamsSchema
} from "@/shared/schemas/skills/request/skill";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(
  zValidator("param", skillVersionParamsSchema, notFoundOnInvalid),
  zValidator("query", previewQuerySchema, notFoundOnInvalid),
  async (c) => {
    const { skillName, version } = c.req.valid("param");
    const { path } = c.req.valid("query");

    const result = await c.get("skillService").preview(skillName, version, path);
    return result.ok ? text(c, result.value) : failure(c, result);
  }
);

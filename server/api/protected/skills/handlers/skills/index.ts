import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { notFoundOnInvalid, type SkillsEnv } from "@/server/api/protected/skills/context";
import { failure, ok } from "@/server/lib/http";
import { skillListQuerySchema, skillNameParamsSchema } from "@/shared/schemas/skills/request/skill";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(
  zValidator("query", skillListQuerySchema, notFoundOnInvalid),
  async (c) => {
    const { query } = c.req.valid("query");

    const result = await c.get("skillService").list(query);
    return result.ok ? ok(c, { skills: result.value }) : failure(c, result);
  }
);

export const show = factory.createHandlers(
  zValidator("param", skillNameParamsSchema, notFoundOnInvalid),
  async (c) => {
    const { skillName } = c.req.valid("param");

    const result = await c.get("skillService").show(skillName);
    return result.ok ? ok(c, result.value) : failure(c, result);
  }
);

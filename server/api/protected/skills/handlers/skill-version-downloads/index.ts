import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { notFoundOnInvalid, type SkillsEnv } from "@/server/api/protected/skills/context";
import { failure, stream } from "@/server/lib/http";
import { skillVersionParamsSchema } from "@/shared/schemas/skills/request/skill";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(
  zValidator("param", skillVersionParamsSchema, notFoundOnInvalid),
  async (c) => {
    const { skillName, version } = c.req.valid("param");

    const result = await c.get("skillService").download(skillName, version);
    return result.ok
      ? stream(c, result.value.body, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${result.value.filename}"`,
          "Content-Length": String(result.value.size)
        })
      : failure(c, result);
  }
);

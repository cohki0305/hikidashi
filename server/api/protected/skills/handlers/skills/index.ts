import { createFactory } from "hono/factory";
import type { SkillsEnv } from "@/server/api/protected/skills/context";
import { pathSegments } from "@/server/api/protected/skills/context";
import { failure, ok } from "@/server/lib/http";
import { notFound } from "@/server/lib/result";
import { skillNameSchema } from "@/shared/schemas/skills";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(async (c) => {
  const result = await c.get("skillService").list(c.req.query("query") ?? "");
  return result.ok ? ok(c, { skills: result.value }) : failure(c, result);
});

export const show = factory.createHandlers(async (c) => {
  const segments = pathSegments(c.req.path);
  const name = segments[segments.length - 1];
  if (name === undefined || !skillNameSchema.safeParse(name).success)
    return failure(c, notFound("スキルが見つかりません"));

  const result = await c.get("skillService").show(name);
  return result.ok ? ok(c, result.value) : failure(c, result);
});

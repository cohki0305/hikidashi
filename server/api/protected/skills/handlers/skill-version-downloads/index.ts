import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { notFoundOnInvalid, type SkillsEnv } from "@/server/api/protected/skills/context";
import { failure, redirect, unavailable } from "@/server/lib/http";
import { skillVersionParamsSchema } from "@/shared/schemas/skills/request/skill";

const factory = createFactory<SkillsEnv>();

export const index = factory.createHandlers(
  zValidator("param", skillVersionParamsSchema, notFoundOnInvalid),
  async (c) => {
    const { skillName, version } = c.req.valid("param");

    const result = await c.get("skillService").installInfo(skillName, version);
    if (!result.ok) {
      // 署名の設定が欠けているときだけ、zip を Worker で流す道に戻さず 503 で閉じる。
      return result.kind === "upstream" && result.details?.missingConfig === true
        ? unavailable(c, result.message)
        : failure(c, result);
    }
    return redirect(c, result.value.downloadUrl);
  }
);

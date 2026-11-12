import { createFactory } from "hono/factory";
import { ok } from "@/server/lib/http";
import type { MeResponse } from "@/shared/schemas/me";

const factory = createFactory();

export const index = factory.createHandlers(async (c) => {
  const email = c.get("email");
  const isMember = await c.get("isMember")(email);
  const body: MeResponse = { email, isMember };
  return ok(c, body);
});

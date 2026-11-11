import { createFactory } from "hono/factory";
import { ok } from "@/server/lib/http";
import type { MeResponse } from "@/shared/schemas/me";

const factory = createFactory();

export const index = factory.createHandlers((c) => {
  const body: MeResponse = { email: c.get("email") };
  return ok(c, body);
});

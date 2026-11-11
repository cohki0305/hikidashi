import { createFactory } from "hono/factory";
import { ok } from "@/server/lib/http";

const factory = createFactory();

export const index = factory.createHandlers((c) => ok(c, { ok: true }));

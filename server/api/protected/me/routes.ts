import { createFactory } from "hono/factory";
import * as me from "@/server/api/protected/me/handlers/me";

const factory = createFactory();

export const meRoutes = factory.createApp().get("/me", ...me.index);

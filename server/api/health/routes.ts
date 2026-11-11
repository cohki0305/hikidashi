import { createFactory } from "hono/factory";
import * as health from "./handlers/health";

const factory = createFactory();

export const healthRoutes = factory.createApp().get("/health", ...health.index);

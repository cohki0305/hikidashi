import { createFactory } from "hono/factory";
import type { McpEnv } from "./context";
import * as mcp from "./handlers/mcp";

const factory = createFactory<McpEnv>();

export const mcpRoutes = factory
  .createApp()
  .get("/mcp", ...mcp.index)
  .post("/mcp", ...mcp.create);

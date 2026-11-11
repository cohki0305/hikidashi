import type { JsonRpcHandlers } from "@/server/lib/mcp/json-rpc";
import type { McpCallContext, McpService } from "@/server/services/mcp-service";

/** /mcp が使う Service の口。 */
export type McpServicePort = Pick<McpService, "authenticate" | "handlersFor">;

export type McpEnv = {
  Variables: {
    mcp: McpServicePort;
    appUrl: string;
    call: McpCallContext;
    handlers: JsonRpcHandlers;
  };
};

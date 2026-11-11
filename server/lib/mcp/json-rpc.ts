import type { z } from "zod";
import type { Result } from "@/server/lib/result";
import type { FinishPublishResult, InstallInfo, PublishTicket } from "@/shared/schemas/mcp";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";

export type { FinishPublishResult, InstallInfo, PublishTicket };

/** 相手が版を名乗らなかったときに返す、こちらの既定の版。 */
export const PROTOCOL_VERSION = "2025-06-18";

/** initialize で Claude に渡す、hikidashi の使い方の案内。 */
export const MCP_INSTRUCTIONS =
  "hikidashi はチームのスキルの置き場です。Claude Code では、会話の始めに ~/.claude/skills/*/.hikidashi.json を読み、check_skill_updates に渡してください。新しい版があれば、スキルの名前と新しい版を利用者に伝え、同意を得てから入れ直してください。勝手に上書きしないでください。";

/** 入れる・公開する準備がまだできていないときに返す文言。 */
export const MISSING_CONFIG_MESSAGE = "管理者が設定を終えていません。管理者に確かめてください。";

/** 名前で引いたスキルの最新版。 */
export type SkillLatest = { name: string; latestVersion: number; fingerprint: string };

/** ツールが使うスキルの一覧と詳細。 */
export type SkillCatalog = {
  list(query: string): Promise<Result<SkillSummary[]>>;
  show(name: string): Promise<Result<SkillDetailResponse>>;
  latestByNames(names: readonly string[]): Promise<Result<SkillLatest[]>>;
};

/** スキルを手元に入れるための口。 */
export type InstallPort = {
  installInfo(name: string, version?: number): Promise<Result<InstallInfo>>;
};

/** スキルを公開するための口。 */
export type PublishPort = {
  begin(email: string): Promise<Result<PublishTicket>>;
  finish(email: string, uploadId: string, note?: string): Promise<Result<FinishPublishResult>>;
};

/** ツールを呼んだ人のメールアドレスと、スキルを読む・入れる・公開する口。 */
export type McpToolContext = {
  email: string;
  skills: SkillCatalog;
  install: InstallPort;
  publish?: PublishPort;
};

/** MCP に載せるツール 1 つ。入力の検証は input の zod に任せる。 */
export type McpTool<I> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
  call(ctx: McpToolContext, input: I): Promise<Result<unknown>>;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolOutcome =
  | { kind: "result"; content: string }
  | { kind: "error"; content: string }
  | { kind: "invalid_params"; message: string };

export type JsonRpcHandlers = {
  listTools(): ToolDescriptor[];
  callTool(name: string, args: unknown): Promise<ToolOutcome>;
};

type Id = string | number | null;
export type JsonRpcReply =
  | { jsonrpc: "2.0"; id: Id; result: unknown }
  | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string } };

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const failure = (id: Id, code: number, message: string): JsonRpcReply => ({
  jsonrpc: "2.0",
  id,
  error: { code, message }
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** initialize は相手が名乗った版をそのまま返す（交渉しない）。 */
function initializeResult(params: unknown) {
  const requested =
    isRecord(params) && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : PROTOCOL_VERSION;
  return {
    protocolVersion: requested,
    capabilities: { tools: {} },
    serverInfo: { name: "hikidashi", version: "1" },
    instructions: MCP_INSTRUCTIONS
  };
}

/**
 * JSON-RPC 2.0 の 1 通を処理する。通知（id なし）は応答しないので null を返す。
 */
export async function handleJsonRpc(
  body: unknown,
  handlers: JsonRpcHandlers
): Promise<JsonRpcReply | null> {
  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string")
    return failure(null, INVALID_REQUEST, "Invalid Request");
  if (!("id" in body)) return null;
  const id: Id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;

  switch (body.method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: initializeResult(body.params) };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: handlers.listTools() } };
    case "tools/call": {
      const params = body.params;
      if (!isRecord(params) || typeof params.name !== "string")
        return failure(id, INVALID_PARAMS, "Invalid params");
      const outcome = await handlers.callTool(params.name, params.arguments ?? {});
      if (outcome.kind === "invalid_params") return failure(id, INVALID_PARAMS, outcome.message);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: outcome.content }],
          ...(outcome.kind === "error" ? { isError: true } : {})
        }
      };
    }
    default:
      return failure(id, METHOD_NOT_FOUND, "Method not found");
  }
}

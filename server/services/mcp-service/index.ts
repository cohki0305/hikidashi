import { z } from "zod";
import {
  type InstallPort,
  type JsonRpcHandlers,
  type McpTool,
  type McpToolContext,
  MISSING_CONFIG_MESSAGE,
  type PublishPort,
  type SkillCatalog,
  type ToolDescriptor,
  type ToolOutcome
} from "@/server/lib/mcp/json-rpc";
import { upstream } from "@/server/lib/result";
import type { OAuthService } from "@/server/services/oauth-service";
import { MCP_TOOLS } from "./tools";

export type McpServiceDeps = {
  /** アクセストークンを、つないだ人のメールアドレスに替える。 */
  oauth: Pick<OAuthService, "authenticate">;
  /** スキルの一覧と詳細。 */
  skills: SkillCatalog;
  /** スキルを手元に入れるための口。 */
  install?: InstallPort;
  /** スキルを公開するための口。 */
  publish?: PublishPort;
  /** そのメールアドレスが今もメンバーかを確かめる。外れた人のトークンは通さない。 */
  isMember: (email: string) => Promise<boolean>;
  /** 載せるツール。省略すると MCP_TOOLS を全部載せる。 */
  tools?: readonly McpTool<unknown>[];
};

/** 呼び出した人。ツールはこのメールアドレスを手がかりに動く。 */
export type McpCallContext = { email: string };

/** MCP の入口が使う、認証と JSON-RPC の処理。 */
export class McpService {
  private readonly tools: readonly McpTool<unknown>[];
  private readonly byName: Map<string, McpTool<unknown>>;

  constructor(private readonly deps: McpServiceDeps) {
    this.tools = deps.tools ?? MCP_TOOLS;
    this.byName = new Map(this.tools.map((tool) => [tool.name, tool]));
  }

  /** トークンを確かめ、呼び出した人を返す。無効なら null（入口が 401 にする）。 */
  async authenticate(accessToken: string): Promise<McpCallContext | null> {
    const auth = await this.deps.oauth.authenticate(accessToken);
    if (auth === null) return null;
    if (!(await this.deps.isMember(auth.email))) return null;
    return { email: auth.email };
  }

  /** JSON-RPC の一覧と実行を、呼び出した人に結びつけて返す。 */
  handlersFor(ctx: McpCallContext): JsonRpcHandlers {
    return {
      listTools: () => this.listTools(),
      callTool: (name, args) => this.callTool(ctx, name, args)
    };
  }

  /** ツールの名前・説明・入力の形。入力の形は zod から作る。 */
  listTools(): ToolDescriptor[] {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.input, { io: "input" }) as Record<string, unknown>
    }));
  }

  async callTool(ctx: McpCallContext, name: string, args: unknown): Promise<ToolOutcome> {
    const tool = this.byName.get(name);
    if (tool === undefined) return { kind: "invalid_params", message: "知らないツールです" };
    const parsed = tool.input.safeParse(args);
    // 入力の間違いは JSON-RPC のエラーではなく、ツールの結果として返す（相手が直せる）
    if (!parsed.success) return { kind: "error", content: "入力が正しくありません" };
    const callContext: McpToolContext = {
      email: ctx.email,
      skills: this.deps.skills,
      install: this.deps.install ?? {
        installInfo: async () => upstream(MISSING_CONFIG_MESSAGE, { missingConfig: true })
      },
      ...(this.deps.publish === undefined ? {} : { publish: this.deps.publish })
    };
    const result = await tool.call(callContext, parsed.data);
    if (!result.ok) return { kind: "error", content: result.message };
    const { value } = result;
    return { kind: "result", content: typeof value === "string" ? value : JSON.stringify(value) };
  }
}

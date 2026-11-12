import { afterEach, describe, expect, test } from "bun:test";
import type { McpServicePort } from "@/server/api/mcp";
import { createApp } from "@/server/app";
import { oauthServiceFromDb } from "@/server/bootstrap";
import { MCP_INSTRUCTIONS } from "@/server/lib/mcp/json-rpc";
import { ok, type Result } from "@/server/lib/result";
import { McpService } from "@/server/services/mcp-service";
import type { SkillService } from "@/server/services/skill-service";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";

const APP_URL = "https://hikidashi.example.test";
const METADATA = `Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const LIVE = { authorization: "Bearer hkd_at_live" };

const summary: SkillSummary = {
  name: "invoice-entry",
  title: "請求書の入力",
  description: "請求書を入力する手順",
  latestVersion: 2,
  updatedAt: "2026-10-20T00:00:00.000Z",
  author: "hanako@example.test",
  sizeBytes: 120,
  claudeCodeOnly: false
};

const detail: SkillDetailResponse = {
  skill: summary,
  files: [],
  versions: [
    {
      version: 2,
      note: null,
      publishedBy: "hanako@example.test",
      createdAt: "2026-10-20T00:00:00.000Z",
      fingerprint: "fp-latest",
      sizeBytes: 120,
      fileCount: 1
    }
  ]
};

const skills = {
  list: async () => ok([summary]),
  show: async () => ok(detail),
  latestByNames: async () =>
    ok([{ name: summary.name, latestVersion: summary.latestVersion, fingerprint: "fp-latest" }])
} as Pick<SkillService, "list" | "show" | "latestByNames">;

function build(
  options: { mcp?: McpServicePort; appUrl?: string } = {}
): ReturnType<typeof createApp> {
  return createApp({
    logError: () => {},
    mcp:
      options.mcp ??
      new McpService({
        oauth: {
          authenticate: async (token) =>
            token === "hkd_at_live" ? { email: "member@example.test" } : null
        },
        skills,
        isMember: async () => true
      }),
    appUrl: options.appUrl ?? `${APP_URL}/`
  });
}

const rpc = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });

const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("POST /mcp の入口", () => {
  test("トークンが無い・無効なら 401 と WWW-Authenticate", async () => {
    const app = build();
    const cases: Record<string, string>[] = [
      {},
      { authorization: "Bearer hkd_at_dead" },
      { authorization: "Basic x" }
    ];
    for (const headers of cases) {
      const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "ping" }, headers);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe(METADATA);
    }
  });

  test("メンバーでない人のトークンは 401（外した後も同じ）", async () => {
    const mcp = new McpService({
      oauth: {
        authenticate: async (token) =>
          token === "hkd_at_live" ? { email: "member@example.test" } : null
      },
      skills,
      isMember: async () => false
    });
    const res = await rpc(build({ mcp }), { jsonrpc: "2.0", id: 1, method: "ping" }, LIVE);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(METADATA);
  });

  test("GET /mcp は 405 で Allow に POST", async () => {
    const res = await build().request("/mcp");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  test("依存が欠けた構成では 404（fail closed）", async () => {
    expect(
      (await rpc(createApp({ logError: () => {} }), { jsonrpc: "2.0", id: 1, method: "ping" }))
        .status
    ).toBe(404);
    expect(
      (
        await rpc(createApp({ logError: () => {}, mcp: buildService() }), {
          jsonrpc: "2.0",
          id: 1,
          method: "ping"
        })
      ).status
    ).toBe(404);
  });
});

function buildService() {
  return new McpService({
    oauth: {
      authenticate: async (token) =>
        token === "hkd_at_live" ? { email: "member@example.test" } : null
    },
    skills,
    isMember: async () => true
  });
}

describe("JSON-RPC の往復", () => {
  test("initialize は相手の版を返し、案内文とサーバーの名前を付ける", async () => {
    const res = await rpc(
      build(),
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      LIVE
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "hikidashi", version: "1" },
        instructions: MCP_INSTRUCTIONS
      }
    });
  });

  test("tools/list は 5 つのツールを入力の形つきで返す", async () => {
    const res = await rpc(build(), { jsonrpc: "2.0", id: 2, method: "tools/list" }, LIVE);
    const body = await json(res);
    const tools = (body.result as { tools: { name: string; inputSchema: unknown }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_skills",
      "check_skill_updates",
      "install_skill",
      "begin_publish",
      "finish_publish"
    ]);
    for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: "object" });
  });

  test("tools/call で list_skills を呼び、JSON の文字で返す", async () => {
    const res = await rpc(
      build(),
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_skills", arguments: { query: "請求書" } }
      },
      LIVE
    );
    const body = await json(res);
    const result = body.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      skills: [
        {
          name: "invoice-entry",
          title: "請求書の入力",
          description: "請求書を入力する手順",
          latestVersion: 2,
          updatedAt: "2026-10-20T00:00:00.000Z",
          claudeCodeOnly: false
        }
      ]
    });
  });

  test("入力が zod に合わないと isError の結果（JSON-RPC のエラーにしない）", async () => {
    const res = await rpc(
      build(),
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "check_skill_updates", arguments: { installed: "x" } }
      },
      LIVE
    );
    const body = await json(res);
    expect(body.error).toBeUndefined();
    expect(body.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "入力が正しくありません" }]
    });
  });

  test("201 件の installed は拒否する", async () => {
    const installed = Array.from({ length: 201 }, (_, index) => ({
      name: `skill-${index}`,
      version: 1,
      fingerprint: "f"
    }));
    const res = await rpc(
      build(),
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "check_skill_updates", arguments: { installed } }
      },
      LIVE
    );
    expect(await json(res)).toMatchObject({ result: { isError: true } });
  });

  test("通知は本文なしの 202", async () => {
    const res = await rpc(build(), { jsonrpc: "2.0", method: "notifications/initialized" }, LIVE);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  test("知らないメソッドは -32601", async () => {
    const res = await rpc(build(), { jsonrpc: "2.0", id: 6, method: "resources/list" }, LIVE);
    expect(await json(res)).toMatchObject({ error: { code: -32601 } });
  });

  test("壊れた JSON は -32600", async () => {
    const res = await build().request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...LIVE },
      body: "{"
    });
    expect(await json(res)).toMatchObject({ error: { code: -32600 } });
  });
});

describe("取り消した grant のトークン", () => {
  const openDbs: TestDb[] = [];
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("呼び出しのたびに確かめ、取り消した後は 401", async () => {
    const testDb = createTestDb();
    openDbs.push(testDb);
    const oauth = oauthServiceFromDb(testDb.db, APP_URL);

    const client = must(await oauth.register({ redirect_uris: [REDIRECT] }));
    const started = must(
      await oauth.startAuthorization({
        responseType: "code",
        clientId: client.client_id,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: "S256",
        state: "st-1"
      })
    );
    if (started.kind !== "pending") throw new Error("pending ではありません");
    const approved = must(await oauth.approve(started.requestId, "member@example.test"));
    const code = new URL(approved.redirectTo).searchParams.get("code") ?? "";
    const tokens = must(
      await oauth.exchangeCode({
        code,
        codeVerifier: VERIFIER,
        clientId: client.client_id,
        redirectUri: REDIRECT
      })
    );
    const app = build({
      mcp: new McpService({ oauth, skills, isMember: async () => true }),
      appUrl: APP_URL
    });
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    expect((await rpc(app, { jsonrpc: "2.0", id: 1, method: "ping" }, headers)).status).toBe(200);

    // 使った refresh がもう一度来ると、その grant は取り消される（OAuth の決まり）
    must(
      await oauth.refresh({
        refreshToken: tokens.refreshToken,
        clientId: client.client_id
      })
    );
    const reused = await oauth.refresh({
      refreshToken: tokens.refreshToken,
      clientId: client.client_id
    });
    expect(reused.ok).toBe(false);
    const revoked = await rpc(app, { jsonrpc: "2.0", id: 2, method: "ping" }, headers);
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get("www-authenticate")).toBe(METADATA);
  });
});

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

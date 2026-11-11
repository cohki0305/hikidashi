import { describe, expect, test } from "bun:test";
import type { SkillCatalog } from "@/server/lib/mcp/json-rpc";
import { ok, upstream } from "@/server/lib/result";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";
import { McpService } from "./index";

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

function build(
  over: {
    list?: SkillCatalog["list"];
    show?: SkillCatalog["show"];
    latestByNames?: SkillCatalog["latestByNames"];
  } = {}
) {
  const skills: SkillCatalog = {
    list: over.list ?? (async () => ok([summary])),
    show: over.show ?? (async () => ok(detail)),
    latestByNames:
      over.latestByNames ??
      (async () => ok([{ name: summary.name, latestVersion: 2, fingerprint: "fp-latest" }]))
  };
  const calls: string[] = [];
  const oauth = {
    authenticate: async (token: string) => {
      calls.push(token);
      return token === "hkd_at_live" ? { email: "member@example.test" } : null;
    }
  };
  return { service: new McpService({ oauth, skills }), calls };
}

const context = { email: "member@example.test" };

describe("McpService", () => {
  test("有効なトークンだけをメールアドレスに替える", async () => {
    const { service } = build();
    expect(await service.authenticate("hkd_at_live")).toEqual({ email: "member@example.test" });
    expect(await service.authenticate("hkd_at_dead")).toBeNull();
  });

  test("tools/list は入力の形つきで 2 つ返す", () => {
    const { service } = build();
    const tools = service.handlersFor(context).listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["list_skills", "check_skill_updates"]);
    for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: "object" });
  });

  test("tools/call は結果を JSON の文字にし、入力の検証は isError にする", async () => {
    const { service } = build();
    const handlers = service.handlersFor(context);
    expect(await handlers.callTool("list_skills", { query: "" })).toMatchObject({ kind: "result" });
    expect(await handlers.callTool("check_skill_updates", { installed: [] })).toMatchObject({
      kind: "result"
    });
    expect(await handlers.callTool("check_skill_updates", { installed: "x" })).toEqual({
      kind: "error",
      content: "入力が正しくありません"
    });
    expect(
      await handlers.callTool("check_skill_updates", { installed: new Array(201).fill({}) })
    ).toEqual({
      kind: "error",
      content: "入力が正しくありません"
    });
  });

  test("知らないツールは invalid_params、業務の失敗は error", async () => {
    const { service } = build({ list: async () => upstream("スキル一覧を読めませんでした") });
    const handlers = service.handlersFor(context);
    expect(await handlers.callTool("nope", {})).toEqual({
      kind: "invalid_params",
      message: "知らないツールです"
    });
    expect(await handlers.callTool("list_skills", {})).toEqual({
      kind: "error",
      content: "スキル一覧を読めませんでした"
    });
  });

  test("呼び出しのたびにトークンを確かめる", async () => {
    const { service, calls } = build();
    await service.authenticate("hkd_at_live");
    await service.authenticate("hkd_at_live");
    expect(calls).toEqual(["hkd_at_live", "hkd_at_live"]);
  });
});

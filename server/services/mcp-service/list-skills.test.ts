import { describe, expect, test } from "bun:test";
import type { McpToolContext, SkillCatalog } from "@/server/lib/mcp/json-rpc";
import { notFound, ok, upstream } from "@/server/lib/result";
import type { SkillSummary } from "@/shared/schemas/skills";
import { listSkillsTool } from "./list-skills";

const summaries: SkillSummary[] = [
  {
    name: "invoice-entry",
    title: "請求書の入力",
    description: "請求書を入力する手順",
    latestVersion: 3,
    updatedAt: "2026-10-20T00:00:00.000Z",
    author: "hanako@example.test",
    sizeBytes: 120,
    claudeCodeOnly: false
  }
];

function context(skills: Pick<SkillCatalog, "list">): McpToolContext {
  return {
    email: "member@example.test",
    skills: {
      list: skills.list,
      show: async () => notFound("スキルが見つかりません"),
      latestByNames: async () => ok([])
    }
  };
}

describe("list_skills", () => {
  test("query を一覧にそのまま渡し、返す欄だけを写す", async () => {
    const calls: string[] = [];
    const skills = {
      list: async (query: string) => {
        calls.push(query);
        return ok(summaries);
      }
    };

    const result = await listSkillsTool.call(context(skills), { query: "請求書" });
    expect(result).toEqual({
      ok: true,
      value: {
        skills: [
          {
            name: "invoice-entry",
            title: "請求書の入力",
            description: "請求書を入力する手順",
            latestVersion: 3,
            updatedAt: "2026-10-20T00:00:00.000Z",
            claudeCodeOnly: false
          }
        ]
      }
    });
    expect(calls).toEqual(["請求書"]);
  });

  test("query が無ければ空の言葉で一覧を引く", async () => {
    const calls: string[] = [];
    const skills = {
      list: async (query: string) => {
        calls.push(query);
        return ok([]);
      }
    };

    expect(await listSkillsTool.call(context(skills), {})).toEqual({
      ok: true,
      value: { skills: [] }
    });
    expect(calls).toEqual([""]);
  });

  test("一覧を読めないときは失敗をそのまま返す", async () => {
    const failure = upstream("スキル一覧を読めませんでした");
    const skills = { list: async () => failure };
    expect(await listSkillsTool.call(context(skills), {})).toEqual(failure);
  });
});

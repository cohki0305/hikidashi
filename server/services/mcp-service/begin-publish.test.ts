import { describe, expect, test } from "bun:test";
import { type McpToolContext, MISSING_CONFIG_MESSAGE } from "@/server/lib/mcp/json-rpc";
import { notFound, ok, upstream } from "@/server/lib/result";
import { beginPublishTool } from "./begin-publish";

const ticket = {
  uploadId: "upload-1",
  uploadUrl: "https://r2.example.test/uploads/upload-1.zip?signature=abc",
  expiresAt: "2026-01-01T00:30:00.000Z",
  maxBytes: 209_715_200
};

type Publish = NonNullable<McpToolContext["publish"]>;

function context(publish?: Publish): McpToolContext {
  return {
    email: "member@example.test",
    skills: {
      list: async () => ok([]),
      show: async () => notFound("スキルが見つかりません"),
      latestByNames: async () => ok([])
    },
    install: { installInfo: async () => notFound("使いません") },
    ...(publish === undefined ? {} : { publish })
  };
}

describe("begin_publish", () => {
  test("アップロード先と、URL・ID を埋めた手順を返す", async () => {
    const calls: string[] = [];
    const result = await beginPublishTool.call(
      context({
        begin: async (email) => {
          calls.push(email);
          return ok(ticket);
        },
        finish: async () => notFound("使いません")
      }),
      {}
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("失敗しました");
    const value = result.value as Record<string, unknown>;
    expect(value).toMatchObject(ticket);
    const steps = value.steps as string;
    expect(steps).toContain(ticket.uploadUrl);
    expect(steps).toContain(ticket.uploadId);
    expect(steps).toContain(String(ticket.maxBytes));
    expect(calls).toEqual(["member@example.test"]);
  });

  test("公開の口が無い環境では管理者向けの文言で断る", async () => {
    expect(await beginPublishTool.call(context(), {})).toEqual({
      ok: false,
      kind: "upstream",
      message: MISSING_CONFIG_MESSAGE
    });
  });

  test("S3 の設定が無いときは管理者向けの文言で断る", async () => {
    const result = await beginPublishTool.call(
      context({
        begin: async () => upstream("R2 の S3 の設定が足りません", { missingConfig: true }),
        finish: async () => notFound("使いません")
      }),
      {}
    );

    expect(result).toEqual({ ok: false, kind: "upstream", message: MISSING_CONFIG_MESSAGE });
  });
});

import { describe, expect, test } from "bun:test";
import { type McpToolContext, MISSING_CONFIG_MESSAGE } from "@/server/lib/mcp/json-rpc";
import { notFound, ok, upstream } from "@/server/lib/result";
import { finishPublishTool } from "./finish-publish";

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

function publishWith(
  finish: Publish["finish"],
  begin: Publish["begin"] = async () => notFound("使いません")
): Publish {
  return { begin, finish };
}

describe("finish_publish", () => {
  test("公開できたら名前・版・新しい指紋・ファイル数・大きさを返す", async () => {
    const published = {
      status: "published" as const,
      name: "invoice-entry",
      version: 4,
      fingerprint: "fp-4",
      fileCount: 2,
      sizeBytes: 300
    };
    const calls: unknown[] = [];
    const result = await finishPublishTool.call(
      context(
        publishWith(async (email, uploadId, note) => {
          calls.push({ email, uploadId, note });
          return ok(published);
        })
      ),
      { uploadId: "upload-1", note: "説明を直しました" }
    );

    expect(result).toEqual({ ok: true, value: published });
    expect(calls).toEqual([
      { email: "member@example.test", uploadId: "upload-1", note: "説明を直しました" }
    ]);
  });

  test("最新版と同じ中身なら変更なしを返す", async () => {
    const unchanged = { status: "unchanged" as const, name: "invoice-entry", version: 4 };
    const result = await finishPublishTool.call(context(publishWith(async () => ok(unchanged))), {
      uploadId: "upload-1"
    });

    expect(result).toEqual({ ok: true, value: unchanged });
  });

  test("他人の受け皿は中身を漏らさず「見つかりません」を返す", async () => {
    const failure = notFound("この受け皿は見つかりません");
    const result = await finishPublishTool.call(context(publishWith(async () => failure)), {
      uploadId: "other-upload"
    });

    expect(result).toEqual(failure);
  });

  test("公開の口が無い環境では管理者向けの文言で断る", async () => {
    expect(await finishPublishTool.call(context(), { uploadId: "upload-1" })).toEqual({
      ok: false,
      kind: "upstream",
      message: MISSING_CONFIG_MESSAGE
    });
  });

  test("S3 の設定が無いときは管理者向けの文言で断る", async () => {
    const result = await finishPublishTool.call(
      context(
        publishWith(async () => upstream("R2 の S3 の設定が足りません", { missingConfig: true }))
      ),
      { uploadId: "upload-1" }
    );

    expect(result).toEqual({ ok: false, kind: "upstream", message: MISSING_CONFIG_MESSAGE });
  });
});

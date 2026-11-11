import { describe, expect, test } from "bun:test";
import {
  type InstallInfo,
  type McpToolContext,
  MISSING_CONFIG_MESSAGE
} from "@/server/lib/mcp/json-rpc";
import { notFound, ok, upstream } from "@/server/lib/result";
import { installSkillTool } from "./install-skill";

const info: InstallInfo = {
  name: "invoice-entry",
  version: 3,
  fingerprint: "fp-3",
  sizeBytes: 120,
  claudeCodeOnly: false,
  downloadUrl: "https://r2.example.test/download?signature=abc",
  expiresInSeconds: 600
};

function context(installInfo: McpToolContext["install"]["installInfo"]): McpToolContext {
  return {
    email: "member@example.test",
    skills: {
      list: async () => ok([]),
      show: async () => notFound("スキルが見つかりません"),
      latestByNames: async () => ok([])
    },
    install: { installInfo }
  };
}

describe("install_skill", () => {
  test("ダウンロード URL と目印、Claude Code と claude.ai の手順を返す", async () => {
    const calls: { name: string; version?: number }[] = [];
    const result = await installSkillTool.call(
      context(async (name, version) => {
        calls.push({ name, version });
        return ok(info);
      }),
      { name: "invoice-entry", version: 3 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("失敗しました");
    const value = result.value as Record<string, unknown>;
    expect(value).toMatchObject({
      name: "invoice-entry",
      version: 3,
      fingerprint: "fp-3",
      sizeBytes: 120,
      claudeCodeOnly: false,
      downloadUrl: info.downloadUrl,
      expiresInSeconds: 600,
      marker: { name: "invoice-entry", version: 3, fingerprint: "fp-3" }
    });
    const steps = value.steps as string;
    expect(steps).toContain(info.downloadUrl);
    expect(steps).toContain("invoice-entry");
    expect(steps).toContain("claude.ai");
    expect(calls).toEqual([{ name: "invoice-entry", version: 3 }]);
  });

  test("版を省略したときはそのままサービスへ渡す", async () => {
    const calls: { name: string; version?: number }[] = [];
    await installSkillTool.call(
      context(async (name, version) => {
        calls.push({ name, version });
        return ok(info);
      }),
      { name: "invoice-entry" }
    );

    expect(calls).toEqual([{ name: "invoice-entry", version: undefined }]);
  });

  test("Claude Code 専用のスキルには claude.ai の手順を出さない", async () => {
    const result = await installSkillTool.call(
      context(async () => ok({ ...info, name: "large-skill", claudeCodeOnly: true })),
      { name: "large-skill" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("失敗しました");
    const steps = (result.value as { steps: string }).steps;
    expect(steps).not.toContain("claude.ai");
    expect(steps).toContain("このスキルは大きいので Claude Code でだけ使えます。");
  });

  test("無い名前・無い版は「見つかりません」をそのまま返す", async () => {
    const failure = notFound("スキルの版が見つかりません");
    expect(
      await installSkillTool.call(
        context(async () => failure),
        {
          name: "missing-skill",
          version: 9
        }
      )
    ).toEqual(failure);
  });

  test("S3 の設定が無いときは管理者向けの文言で断る", async () => {
    const result = await installSkillTool.call(
      context(async () => upstream("R2 の S3 の設定が足りません", { missingConfig: true })),
      { name: "invoice-entry" }
    );

    expect(result).toEqual({ ok: false, kind: "upstream", message: MISSING_CONFIG_MESSAGE });
  });
});

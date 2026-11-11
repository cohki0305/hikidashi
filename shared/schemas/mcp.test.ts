import { describe, expect, test } from "bun:test";
import {
  beginPublishInputSchema,
  checkSkillUpdatesInputSchema,
  finishPublishInputSchema,
  finishPublishResultSchema,
  installInfoSchema,
  installSkillInputSchema,
  listSkillsInputSchema,
  publishTicketSchema
} from "./mcp";

const installed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `skill-${index}`,
    version: 1,
    fingerprint: "a".repeat(64)
  }));

describe("MCP ツールの入力", () => {
  test("list_skills は query 無しでも受ける", () => {
    expect(listSkillsInputSchema.safeParse({}).success).toBe(true);
    expect(listSkillsInputSchema.safeParse({ query: "見積" }).success).toBe(true);
    expect(listSkillsInputSchema.safeParse({ query: 1 }).success).toBe(false);
    expect(listSkillsInputSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
  });

  test("check_skill_updates は 200 件まで受ける", () => {
    expect(checkSkillUpdatesInputSchema.safeParse({ installed: installed(200) }).success).toBe(
      true
    );
  });

  test("check_skill_updates は 201 件を拒否する", () => {
    expect(checkSkillUpdatesInputSchema.safeParse({ installed: installed(201) }).success).toBe(
      false
    );
  });

  test("check_skill_updates は版番号の無い・負の入力を拒否する", () => {
    expect(
      checkSkillUpdatesInputSchema.safeParse({
        installed: [{ name: "skill-a", version: 0, fingerprint: "f" }]
      }).success
    ).toBe(false);
    expect(
      checkSkillUpdatesInputSchema.safeParse({
        installed: [{ name: "skill-a", fingerprint: "f" }]
      }).success
    ).toBe(false);
  });

  test("install_skill は名前だけでも版つきでも受ける", () => {
    expect(installSkillInputSchema.safeParse({ name: "invoice-entry" }).success).toBe(true);
    expect(installSkillInputSchema.safeParse({ name: "invoice-entry", version: 2 }).success).toBe(
      true
    );
    expect(installSkillInputSchema.safeParse({ name: "Invoice" }).success).toBe(false);
    expect(installSkillInputSchema.safeParse({ name: "invoice-entry", version: 0 }).success).toBe(
      false
    );
  });

  test("begin_publish は入力を取らない", () => {
    expect(beginPublishInputSchema.safeParse({}).success).toBe(true);
  });

  test("finish_publish は受け皿を必須にし、note は 500 字まで受ける", () => {
    expect(finishPublishInputSchema.safeParse({ uploadId: "upload-1" }).success).toBe(true);
    expect(finishPublishInputSchema.safeParse({ uploadId: "" }).success).toBe(false);
    expect(
      finishPublishInputSchema.safeParse({ uploadId: "upload-1", note: "あ".repeat(500) }).success
    ).toBe(true);
    expect(
      finishPublishInputSchema.safeParse({ uploadId: "upload-1", note: "あ".repeat(501) }).success
    ).toBe(false);
  });
});

describe("MCP ツールの結果", () => {
  const installedInfo = {
    name: "invoice-entry",
    version: 3,
    fingerprint: "fp-3",
    sizeBytes: 120,
    claudeCodeOnly: false,
    downloadUrl: "https://r2.example.test/download?signature=abc",
    expiresInSeconds: 600
  };

  test("install_skill の結果は指紋とダウンロード先を必須にする", () => {
    expect(installInfoSchema.safeParse(installedInfo).success).toBe(true);
    expect(
      installInfoSchema.safeParse({
        name: "invoice-entry",
        version: 3,
        sizeBytes: 120,
        claudeCodeOnly: false,
        downloadUrl: "https://r2.example.test/download?signature=abc",
        expiresInSeconds: 600
      }).success
    ).toBe(false);
  });

  test("begin_publish の結果は受け皿とアップロード先を必須にする", () => {
    const ticket = {
      uploadId: "upload-1",
      uploadUrl: "https://r2.example.test/uploads/upload-1.zip?signature=abc",
      expiresAt: "2026-01-01T00:30:00.000Z",
      maxBytes: 209_715_200
    };
    expect(publishTicketSchema.safeParse(ticket).success).toBe(true);
  });

  test("finish_publish の結果は公開時に指紋を必須にする", () => {
    const published = {
      status: "published",
      name: "invoice-entry",
      version: 4,
      fingerprint: "fp-4",
      fileCount: 2,
      sizeBytes: 300
    };
    expect(finishPublishResultSchema.safeParse(published).success).toBe(true);
    expect(
      finishPublishResultSchema.safeParse({
        status: "published",
        name: "invoice-entry",
        version: 4,
        fileCount: 2,
        sizeBytes: 300
      }).success
    ).toBe(false);
    expect(
      finishPublishResultSchema.safeParse({
        status: "unchanged",
        name: "invoice-entry",
        version: 4
      }).success
    ).toBe(true);
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { FilePreview } from "./file-preview";

afterEach(cleanup);

function renderPreview(
  file: Parameters<typeof FilePreview>[0]["file"],
  content: Parameters<typeof FilePreview>[0]["content"] = undefined,
  isPending = false
) {
  render(<FilePreview file={file} content={content} isPending={isPending} />);
}

describe("ファイルの中身", () => {
  test("テキストは渡された中身を出す", () => {
    renderPreview(
      { path: "SKILL.md", sizeBytes: 600, isText: true },
      { ok: true, value: "# 内容を読む\n本文" }
    );
    expect(screen.getByText(/# 内容を読む/)).toBeTruthy();
  });

  test("読み込み中は案内を出す", () => {
    renderPreview({ path: "SKILL.md", sizeBytes: 600, isText: true }, undefined, true);
    expect(screen.getByText("読み込み中です…")).toBeTruthy();
  });

  test("バイナリは案内とサイズを出す", () => {
    renderPreview({ path: "assets/intro.mp4", sizeBytes: 5 * 1024 * 1024, isText: false });
    expect(screen.getByText("プレビューできないファイルです")).toBeTruthy();
    expect(screen.getByText("5 MB")).toBeTruthy();
  });

  test("取れなかったときは知らせる", () => {
    renderPreview(
      { path: "missing.md", sizeBytes: 10, isText: true },
      { ok: false, kind: "upstream", message: "読み込みに失敗しました" }
    );
    expect(screen.getByText("中身を読み込めませんでした。")).toBeTruthy();
  });

  test("ファイルが無ければ何も出さない", () => {
    const { container } = render(<FilePreview file={null} content={undefined} isPending={false} />);
    expect(container.textContent).toBe("");
  });
});

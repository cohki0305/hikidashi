import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { mockFetch } from "@/app/dev-mocks/fetch";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { FilePreview } from "./file-preview";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function renderPreview(file: Parameters<typeof FilePreview>[0]["file"]) {
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    return mockFetch(input, init);
  }) as typeof fetch;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <FilePreview name="minutes-summary" version={3} file={file} />
    </QueryClientProvider>
  );
  return urls;
}

describe("ファイルの中身", () => {
  test("テキストは中身を取って出す", async () => {
    const urls = renderPreview({ path: "SKILL.md", sizeBytes: 600, isText: true });
    await waitFor(() => expect(screen.getByText(/内容を読む/)).toBeTruthy());
    expect(urls[0]).toBe("/api/skills/minutes-summary/versions/3/files?path=SKILL.md");
  });

  test("バイナリは取りに行かず、案内とサイズを出す", async () => {
    const urls = renderPreview({
      path: "assets/intro.mp4",
      sizeBytes: 5 * 1024 * 1024,
      isText: false
    });
    expect(screen.getByText("プレビューできないファイルです")).toBeTruthy();
    expect(screen.getByText("5 MB")).toBeTruthy();
    await waitFor(() => expect(urls.length).toBe(0));
    await Promise.resolve();
    expect(urls.length).toBe(0);
  });

  test("取れなかったときは知らせる", async () => {
    renderPreview({ path: "missing.md", sizeBytes: 10, isText: true });
    await waitFor(() => expect(screen.getByText("中身を読み込めませんでした。")).toBeTruthy());
  });

  test("ファイルが無ければ何も出さない", () => {
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <FilePreview name="x" version={1} file={null} />
      </QueryClientProvider>
    );
    expect(container.textContent).toBe("");
  });
});

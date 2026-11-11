import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { useSkillFile } from "./index";

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
});

function wrapperFor(client: ReturnType<typeof createQueryClient>) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useSkillFile", () => {
  test("版とパスでファイルの中身を取る", async () => {
    const urls: string[] = [];
    setDefaultFetch((async (input: unknown) => {
      urls.push(String(input));
      return new Response("# 議事録まとめ");
    }) as unknown as typeof fetch);
    const { result } = renderHook(() => useSkillFile("minutes-summary", 3, "SKILL.md"), {
      wrapper: wrapperFor(createQueryClient())
    });
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    const data = result.current.data;
    expect(data?.ok && data.value).toBe("# 議事録まとめ");
    expect(urls[0]).toBe("/api/skills/minutes-summary/versions/3/files?path=SKILL.md");
  });

  test("取れないときは upstream になる", async () => {
    setDefaultFetch((async () => new Response("x", { status: 500 })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSkillFile("minutes-summary", 3, "SKILL.md"), {
      wrapper: wrapperFor(createQueryClient())
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const data = result.current.data;
    expect(data?.ok === false && data.kind).toBe("upstream");
  });

  test("使わないときは取りに行かない", async () => {
    const urls: string[] = [];
    setDefaultFetch((async (input: unknown) => {
      urls.push(String(input));
      return new Response("x");
    }) as unknown as typeof fetch);
    const { result } = renderHook(
      () => useSkillFile("minutes-summary", 3, "assets/intro.mp4", { enabled: false }),
      { wrapper: wrapperFor(createQueryClient()) }
    );
    await Promise.resolve();
    expect(result.current.fetchStatus).toBe("idle");
    expect(urls).toEqual([]);
  });
});

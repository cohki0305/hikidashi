import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockDetail } from "@/app/dev-mocks/data";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { useSkill } from "./index";

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
});

function wrapperFor(client: ReturnType<typeof createQueryClient>) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useSkill", () => {
  test("名前で詳細を取る", async () => {
    const urls: string[] = [];
    setDefaultFetch((async (input: unknown) => {
      urls.push(String(input));
      return new Response(JSON.stringify(mockDetail("minutes-summary")));
    }) as unknown as typeof fetch);
    const { result } = renderHook(() => useSkill("minutes-summary"), {
      wrapper: wrapperFor(createQueryClient())
    });
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    expect(urls[0]).toBe("/api/skills/minutes-summary");
  });

  test("無ければ notFound になる", async () => {
    setDefaultFetch((async () => new Response("{}", { status: 404 })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSkill("nothing"), {
      wrapper: wrapperFor(createQueryClient())
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const data = result.current.data;
    expect(data?.ok === false && data.kind).toBe("not_found");
  });
});

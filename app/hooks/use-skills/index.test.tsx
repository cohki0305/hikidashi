import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockSkills } from "@/app/dev-mocks/data";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { useSkills } from "./index";

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
});

describe("useSkills", () => {
  test("検索語つきで一覧を取る", async () => {
    const urls: string[] = [];
    setDefaultFetch((async (input: unknown) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ skills: mockSkills }));
    }) as unknown as typeof fetch);
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSkills("議事"), { wrapper });
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    expect(urls[0]).toBe(`/api/skills?query=${encodeURIComponent("議事")}`);
  });
});

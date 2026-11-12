import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { useMe } from "./index";

afterEach(() => {
  cleanup();
  setDefaultFetch(null);
});

describe("useMe", () => {
  test("ログイン中のメールを取る", async () => {
    setDefaultFetch(
      (async () =>
        new Response(
          JSON.stringify({ email: "sato@example.com", isMember: true })
        )) as unknown as typeof fetch
    );
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    const data = result.current.data;
    expect(data?.ok && data.value.email).toBe("sato@example.com");
  });
});

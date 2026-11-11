import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getJson, setDefaultFetch } from "./api";

const schema = z.object({ email: z.email() });

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    })) as unknown as typeof fetch;
}

describe("getJson", () => {
  test("200 で正しい形なら ok を返す", async () => {
    const result = await getJson("/api/me", schema, fakeFetch(200, { email: "sato@example.com" }));
    expect(result).toEqual({ ok: true, value: { email: "sato@example.com" } });
  });

  test("404 は notFound を返す", async () => {
    const result = await getJson("/api/me", schema, fakeFetch(404, { error: "x" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("not_found");
  });

  test("形が違うと upstream を返す", async () => {
    const result = await getJson("/api/me", schema, fakeFetch(200, { email: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });

  test("500 は upstream を返す", async () => {
    const result = await getJson("/api/me", schema, fakeFetch(500, {}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });

  test("通信に失敗すると upstream を返す", async () => {
    const failing = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const result = await getJson("/api/me", schema, failing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });

  test("既定の fetch を差し替えられる", async () => {
    setDefaultFetch(fakeFetch(200, { email: "tanaka@example.com" }));
    try {
      const result = await getJson("/api/me", schema);
      expect(result.ok).toBe(true);
    } finally {
      setDefaultFetch(null);
    }
  });
});

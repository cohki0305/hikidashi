import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getJson, getText, setDefaultFetch } from "./api";

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

describe("getText", () => {
  test("200 なら本文を返す", async () => {
    const fake = (async () => new Response("# 見出し")) as unknown as typeof fetch;
    const result = await getText("/api/skills/a/versions/1/files?path=SKILL.md", fake);
    expect(result).toEqual({ ok: true, value: "# 見出し" });
  });

  test("404 は notFound、500 は upstream を返す", async () => {
    const notFound = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
    const missing = await getText("/api/x", notFound);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.kind).toBe("not_found");

    const failing = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const failed = await getText("/api/x", failing);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.kind).toBe("upstream");
  });

  test("通信に失敗すると upstream を返す", async () => {
    const failing = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const result = await getText("/api/x", failing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });
});

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getJson, getText, postJson, sendRequest, setDefaultFetch } from "./api";

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

describe("sendRequest", () => {
  test("成功なら応答を返し、既定の fetch を使う", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    setDefaultFetch(impl);
    try {
      const result = await sendRequest("DELETE", "/api/invites/iv-1");
      expect(result.ok).toBe(true);
      expect(calls[0]?.url).toBe("/api/invites/iv-1");
      expect(calls[0]?.init?.method).toBe("DELETE");
    } finally {
      setDefaultFetch(null);
    }
  });

  test("404 は not_found、403 は forbidden、500 は upstream を返す", async () => {
    const missing = await sendRequest("DELETE", "/api/x", {
      fetchImpl: fakeFetch(404, {})
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.kind).toBe("not_found");

    const forbidden = await sendRequest("DELETE", "/api/x", {
      fetchImpl: fakeFetch(403, {})
    });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.kind).toBe("forbidden");

    const failed = await sendRequest("POST", "/api/x", { fetchImpl: fakeFetch(500, {}) });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.kind).toBe("upstream");
  });

  test("通信に失敗すると upstream を返す", async () => {
    const failing = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const result = await sendRequest("POST", "/api/x", { fetchImpl: failing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });
});

describe("postJson", () => {
  const bodySchema = z.object({ joined: z.boolean() });

  test("本文を JSON で送り、応答をスキーマで検査する", async () => {
    let sentBody: string | undefined;
    const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sentBody = init?.body === undefined ? undefined : String(init.body);
      return new Response(JSON.stringify({ joined: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;
    const result = await postJson("/api/invites/redemptions", { key: "hkd" }, bodySchema, impl);
    expect(result).toEqual({ ok: true, value: { joined: true } });
    expect(JSON.parse(String(sentBody))).toEqual({ key: "hkd" });
  });

  test("応答の形が違うと upstream を返す", async () => {
    const result = await postJson(
      "/api/invites/redemptions",
      { key: "hkd" },
      bodySchema,
      fakeFetch(200, { joined: "yes" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });
});

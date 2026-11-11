import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { failure, ok, stream, text } from "./http";
import { conflict, invalid, notFound, rateLimited, upstream } from "./result";

describe("http", () => {
  test("ok は 200 で本文を返す", async () => {
    const app = new Hono().get("/", (c) => ok(c, { hello: "world" }));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  test("text は text/plain で本文を返す", async () => {
    const app = new Hono().get("/", (c) => text(c, "# 見本のスキル\n"));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("# 見本のスキル\n");
  });

  test("stream は渡したヘッダーと本文を返す", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("zip-bytes"));
        controller.close();
      }
    });
    const app = new Hono().get("/", (c) =>
      stream(c, body, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="alpha-v1.zip"',
        "Content-Length": "9"
      })
    );
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="alpha-v1.zip"');
    expect(res.headers.get("content-length")).toBe("9");
    expect(await res.text()).toBe("zip-bytes");
  });

  test("failure は kind ごとの status で本文を返す", async () => {
    const cases = [
      [notFound("無い"), 404, "not_found"],
      [invalid("不正"), 400, "invalid"],
      [conflict("競合"), 409, "conflict"],
      [rateLimited("多い"), 429, "rate_limited"],
      [upstream("上流"), 502, "upstream"]
    ] as const;
    for (const [err, status, kind] of cases) {
      const app = new Hono().get("/", (c) => failure(c, err));
      const res = await app.request("/");
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: err.message, kind, details: null });
    }
  });
});

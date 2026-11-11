import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { failure, ok } from "./http";
import { conflict, invalid, notFound, rateLimited, upstream } from "./result";

describe("http", () => {
  test("ok は 200 で本文を返す", async () => {
    const app = new Hono().get("/", (c) => ok(c, { hello: "world" }));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
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

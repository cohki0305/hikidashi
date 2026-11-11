import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { acceptedWithoutBody, methodNotAllowed, unauthorized } from "./http";

const app = new Hono()
  .get("/a", (c) => acceptedWithoutBody(c))
  .get("/m", (c) => methodNotAllowed(c, "POST"))
  .get("/u", (c) => unauthorized(c));

describe("MCP の応答", () => {
  test("通知には本文なしの 202", async () => {
    const res = await app.request("/a");
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  test("許さないメソッドは 405 と Allow", async () => {
    const res = await app.request("/m");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  test("確かめられない呼び出しは 401", async () => {
    const res = await app.request("/u");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

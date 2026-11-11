import { describe, expect, it } from "bun:test";
import { healthRoutes } from "./index";

describe("healthRoutes", () => {
  it("GET /health は 200 { ok: true } を返す", async () => {
    const response = await healthRoutes.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

import { describe, expect, test } from "bun:test";
import { bootstrap } from "./bootstrap";

describe("bootstrap", () => {
  test("環境の束縛が無くても最小の API を組み立てる", async () => {
    const res = await bootstrap({}).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

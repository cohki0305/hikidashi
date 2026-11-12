import { describe, expect, test } from "bun:test";
import { bootstrap, ownerEmailsFromEnv } from "./bootstrap";

describe("bootstrap", () => {
  test("環境の束縛が無くても最小の API を組み立てる", async () => {
    const res = await bootstrap({}).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("ownerEmailsFromEnv", () => {
  test("カンマ区切りを小文字にそろえ、空の項目を落とす", () => {
    expect(
      ownerEmailsFromEnv({ OWNER_EMAILS: " Owner@Example.COM , ,hanako@example.test " })
    ).toEqual(["owner@example.com", "hanako@example.test"]);
  });

  test("重複を落とす", () => {
    expect(ownerEmailsFromEnv({ OWNER_EMAILS: "owner@example.test,OWNER@example.test" })).toEqual([
      "owner@example.test"
    ]);
  });

  test("空なら誰もオーナーにしない（fail closed）", () => {
    expect(ownerEmailsFromEnv({})).toEqual([]);
    expect(ownerEmailsFromEnv({ OWNER_EMAILS: " , " })).toEqual([]);
  });
});

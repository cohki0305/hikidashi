import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { oauthError, parseRegistration, plainText, redirectTo, stringFields } from "./http";

describe("応答の形", () => {
  const app = new Hono()
    .get("/error", (c) => oauthError(c, 400, "invalid_grant", "説明"))
    .get("/error-short", (c) => oauthError(c, 429, "temporarily_unavailable"))
    .get("/text", (c) =>
      plainText(
        c,
        400,
        "このつなぎ方は使えません。Claude の画面から、もう一度つなぎ直してください。"
      )
    )
    .get("/redirect", (c) => redirectTo(c, "/authorize?request=x"));

  test("エラーは RFC 6749 の形で、保存させない", async () => {
    const response = await app.request("/error");
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "invalid_grant", error_description: "説明" });
    expect(await (await app.request("/error-short")).json()).toEqual({
      error: "temporarily_unavailable"
    });
  });

  test("素の文と 302", async () => {
    const text = await app.request("/text");
    expect(text.status).toBe(400);
    expect(await text.text()).toBe(
      "このつなぎ方は使えません。Claude の画面から、もう一度つなぎ直してください。"
    );
    const redirect = await app.request("/redirect");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/authorize?request=x");
  });
});

describe("stringFields", () => {
  test("文字列だけ取り、ほかは undefined", () => {
    expect(
      stringFields({ a: "x", b: 1, c: new File([], "f"), d: ["y"] }, ["a", "b", "c", "d", "e"])
    ).toEqual({
      a: "x",
      b: undefined,
      c: undefined,
      d: undefined,
      e: undefined
    });
  });
});

describe("parseRegistration", () => {
  test("名前と戻り先を取り出す。文字列でない戻り先は空にして弾かれるようにする", () => {
    expect(
      parseRegistration({ client_name: "架空の Claude", redirect_uris: ["https://claude.ai/cb"] })
    ).toEqual({
      clientName: "架空の Claude",
      redirectUris: ["https://claude.ai/cb"]
    });
    expect(parseRegistration({ redirect_uris: ["https://a.example.test/cb", 1] })).toEqual({
      clientName: undefined,
      redirectUris: ["https://a.example.test/cb", ""]
    });
    expect(parseRegistration({ client_name: 5 })).toEqual({
      clientName: undefined,
      redirectUris: []
    });
  });

  test("オブジェクトでなければ null", () => {
    expect(parseRegistration(null)).toBeNull();
    expect(parseRegistration("x")).toBeNull();
    expect(parseRegistration([])).toBeNull();
  });
});

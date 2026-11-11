import { afterEach, describe, expect, test } from "bun:test";
import { oauthClients } from "@/server/db/schema";
import { OauthClientRepository } from "@/server/repositories/oauth-client-repository";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { registerClient } from "./register";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const openDbs: TestDb[] = [];

function setup() {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return {
    db: testDb.db,
    clients: new OauthClientRepository(testDb.db)
  };
}

async function register(
  deps: { clients: OauthClientRepository },
  input: { client_name?: unknown; redirect_uris?: unknown }
) {
  return registerClient(deps, input);
}

describe("registerClient", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("登録した形を返し、名前が無ければ Claude にする", async () => {
    const deps = setup();
    const result = await register(deps, { redirect_uris: [REDIRECT] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.client_id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result.value).toMatchObject({
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
  });

  test("名前は前後の空白を落とし、100 字に切る", async () => {
    const deps = setup();
    const result = await register(deps, {
      client_name: `  ${"あ".repeat(150)}  `,
      redirect_uris: [REDIRECT]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.client_name).toHaveLength(100);
  });

  test("戻り先が 6 件・0 件・http の一般のドメイン・文字列でない値は invalid_redirect_uri", async () => {
    for (const redirectUris of [
      Array.from({ length: 6 }, (_, index) => `https://a${index}.example.test/cb`),
      [],
      ["http://example.com/cb"],
      [REDIRECT, 1],
      "https://claude.ai/cb"
    ]) {
      const { db, clients } = setup();
      expect(await register({ clients }, { redirect_uris: redirectUris })).toMatchObject({
        ok: false,
        kind: "invalid",
        message: "invalid_redirect_uri"
      });
      expect(await db.select().from(oauthClients)).toHaveLength(0);
    }
  });

  test("localhost の http を戻り先にできる", async () => {
    const deps = setup();
    const result = await register(deps, { redirect_uris: ["http://localhost:6274/cb"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.redirect_uris).toEqual(["http://localhost:6274/cb"]);
  });

  test("保存できなければ invalid_client_metadata", async () => {
    const broken = {
      create: async () => ({ ok: true as const, value: null })
    };
    expect(await registerClient({ clients: broken }, { redirect_uris: [REDIRECT] })).toMatchObject({
      ok: false,
      kind: "invalid",
      message: "invalid_client_metadata"
    });
  });
});

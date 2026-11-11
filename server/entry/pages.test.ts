import { describe, expect, test } from "bun:test";
import { isAppPath, servePage } from "./pages";

const INDEX = "<!DOCTYPE html><title>hikidashi</title>";

/** 配る元の偽物。files にある道だけファイルを返し、ほかは index.html を返す */
function fakeAssets(files: Record<string, { body: string; type: string }> = {}) {
  const seen: string[] = [];
  return {
    seen,
    fetch: async (request: Request) => {
      const { pathname } = new URL(request.url);
      seen.push(pathname);
      const file = files[pathname];
      if (file) return new Response(file.body, { headers: { "content-type": file.type } });
      return new Response(INDEX, { headers: { "content-type": "text/html" } });
    }
  };
}

const get = (path: string) => new Request(`https://hikidashi.example${path}`);

describe("servePage", () => {
  test("画面のある道は 200 で画面を返す", async () => {
    const response = await servePage(get("/"), fakeAssets());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX);
  });

  test("許可の画面は 200 で画面を返す", async () => {
    const response = await servePage(get("/authorize"), fakeAssets());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX);
  });

  test("画面の無い道は 404 で同じ画面を返す", async () => {
    const response = await servePage(get("/nope"), fakeAssets());
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toBe(INDEX);
  });

  test("ファイルはそのまま返す", async () => {
    const assets = fakeAssets({ "/robots.txt": { body: "User-agent: *", type: "text/plain" } });
    const response = await servePage(get("/robots.txt"), assets);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("User-agent: *");
  });

  test("配る元が 404 を返したら index.html を取り直し、画面の無い道なら 404 にする", async () => {
    const assets = {
      fetch: async (request: Request) =>
        new URL(request.url).pathname === "/index.html"
          ? new Response(INDEX, { headers: { "content-type": "text/html" } })
          : new Response("", { status: 404 })
    };
    expect((await servePage(get("/"), assets)).status).toBe(200);
    const missing = await servePage(get("/nope"), assets);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(INDEX);
  });
});

describe("isAppPath", () => {
  test("API と OAuth の道は true", () => {
    for (const path of [
      "/api",
      "/api/health",
      "/oauth/authorize",
      "/oauth/token",
      "/.well-known/oauth-authorization-server"
    ])
      expect(isAppPath(path)).toBe(true);
  });

  test("画面とファイルの道は false", () => {
    for (const path of ["/", "/authorize", "/apis", "/nope"]) expect(isAppPath(path)).toBe(false);
  });
});

import { mockDetail, mockFileBody, mockMe, mockSkills } from "./data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** 開発用の偽の fetch。本物のサーバーを呼ばずに画面を確かめるために使う。 */
export const mockFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : String(input), "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "api") return json({ error: "not_found" }, 404);

  if (parts[1] === "me" && parts.length === 2) return json(mockMe);

  if (parts[1] === "skills" && parts.length === 2) {
    const q = (url.searchParams.get("query") ?? "").trim();
    const skills = q ? mockSkills.filter((s) => (s.title + s.description).includes(q)) : mockSkills;
    return json({ skills });
  }

  if (parts[1] === "skills" && parts.length === 3) {
    const detail = mockDetail(parts[2] ?? "");
    return detail ? json(detail) : json({ error: "not_found" }, 404);
  }

  if (parts[1] === "skills" && parts[3] === "versions" && parts[5] === "files") {
    const body = mockFileBody(url.searchParams.get("path") ?? "");
    return body === null
      ? json({ error: "not_found" }, 404)
      : new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  return json({ error: "not_found" }, 404);
}) as typeof fetch;

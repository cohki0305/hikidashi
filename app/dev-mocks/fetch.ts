import { mockDetail, mockFileBody, mockInvites, mockMe, mockMembers, mockSkills } from "./data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** 開発用の偽の fetch。本物のサーバーを呼ばずに画面を確かめるために使う。 */
export const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : String(input), "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = init?.method ?? "GET";
  if (parts[0] !== "api") return json({ error: "not_found" }, 404);

  if (parts[1] === "me" && parts.length === 2) return json(mockMe);

  if (parts[1] === "members" && parts.length === 2 && method === "GET") {
    return json({ members: mockMembers });
  }

  if (parts[1] === "members" && parts.length === 3 && method === "DELETE") {
    return new Response(null, { status: 204 });
  }

  if (
    parts[1] === "invites" &&
    parts.length === 3 &&
    parts[2] === "redemptions" &&
    method === "POST"
  ) {
    return json({ joined: true });
  }

  if (parts[1] === "invites" && parts.length === 2) {
    if (method === "GET") return json({ invites: mockInvites });
    if (method === "POST") {
      return json(
        {
          id: "iv-mock-new",
          url: "https://hikidashi.example.test/join?key=hkd_iv_mock",
          expiresAt: "2026-11-19T00:00:00.000Z"
        },
        201
      );
    }
  }

  if (parts[1] === "invites" && parts.length === 3 && method === "DELETE") {
    return new Response(null, { status: 204 });
  }

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

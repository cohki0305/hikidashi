import { describe, expect, test } from "bun:test";
import { mockFetch } from "./fetch";

describe("偽の fetch", () => {
  test("一覧は検索語で絞る", async () => {
    const res = await mockFetch(`/api/skills?query=${encodeURIComponent("議事録")}`);
    const body = (await res.json()) as { skills: { title: string }[] };
    expect(body.skills.map((s) => s.title)).toEqual(["議事録まとめ"]);
  });

  test("メンバーと招待リンクも返す", async () => {
    const members = await mockFetch("/api/members");
    expect(members.status).toBe(200);
    expect(((await members.json()) as { members: unknown[] }).members.length).toBeGreaterThan(0);

    const invites = await mockFetch("/api/invites");
    expect(invites.status).toBe(200);
    expect(((await invites.json()) as { invites: unknown[] }).invites.length).toBeGreaterThan(0);
  });

  test("招待リンクを作る・止める・使う", async () => {
    const created = await mockFetch("/api/invites", { method: "POST" });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { url: string }).url).toContain("/join?key=");

    expect((await mockFetch("/api/invites/iv-mock-1", { method: "DELETE" })).status).toBe(204);
    expect(
      (await mockFetch("/api/members/suzuki%40example.com", { method: "DELETE" })).status
    ).toBe(204);

    const redeemed = await mockFetch("/api/invites/redemptions", { method: "POST" });
    expect(((await redeemed.json()) as { joined: boolean }).joined).toBe(true);
  });

  test("詳細・無い名前・自分のメール・ファイル本文", async () => {
    expect((await mockFetch("/api/skills/weekly-report")).status).toBe(200);
    expect((await mockFetch("/api/skills/nothing")).status).toBe(404);
    expect(((await (await mockFetch("/api/me")).json()) as { email: string }).email).toContain("@");
    const file = await mockFetch("/api/skills/weekly-report/versions/1/files?path=SKILL.md");
    expect(await file.text()).toContain("手順");
  });
});

import { describe, expect, test } from "bun:test";
import { mockFetch } from "./fetch";

describe("偽の fetch", () => {
  test("一覧は検索語で絞る", async () => {
    const res = await mockFetch(`/api/skills?query=${encodeURIComponent("議事録")}`);
    const body = (await res.json()) as { skills: { title: string }[] };
    expect(body.skills.map((s) => s.title)).toEqual(["議事録まとめ"]);
  });

  test("詳細・無い名前・自分のメール・ファイル本文", async () => {
    expect((await mockFetch("/api/skills/weekly-report")).status).toBe(200);
    expect((await mockFetch("/api/skills/nothing")).status).toBe(404);
    expect(((await (await mockFetch("/api/me")).json()) as { email: string }).email).toContain("@");
    const file = await mockFetch("/api/skills/weekly-report/versions/1/files?path=SKILL.md");
    expect(await file.text()).toContain("手順");
  });
});

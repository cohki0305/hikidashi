import { afterEach, describe, expect, test } from "bun:test";
import { skillFiles, skills, skillVersions } from "@/server/db/schema";
import { createTestDb } from "./test-db";

const NOW = "2026-01-01T00:00:00.000Z";

const openDbs: ReturnType<typeof createTestDb>[] = [];

function setup() {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return testDb;
}

function insertSkill(db: ReturnType<typeof createTestDb>["db"], id: string, name: string) {
  return db.insert(skills).values({
    id,
    name,
    title: "見本のスキル",
    description: "説明",
    latestVersion: 1,
    createdAt: NOW,
    updatedAt: NOW
  });
}

function insertSkillRun(db: ReturnType<typeof createTestDb>["db"], id: string, name: string) {
  insertSkill(db, id, name).run();
}

describe("createTestDb", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("マイグレーションを流すと 9 つのテーブルがある", () => {
    const { sqlite } = setup();
    const tables = sqlite
      .query("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();
    expect(tables).toEqual([
      "oauth_access_tokens",
      "oauth_clients",
      "oauth_grants",
      "oauth_requests",
      "oauth_used_refresh_tokens",
      "skill_files",
      "skill_versions",
      "skills",
      "uploads"
    ]);
  });

  test("skills.name は重複できない", () => {
    const { db } = setup();
    insertSkillRun(db, "skill-1", "same-name");
    expect(() => insertSkillRun(db, "skill-2", "same-name")).toThrow();
  });

  test("skill_versions の (skill_id, version) は重複できない", () => {
    const { db } = setup();
    insertSkillRun(db, "skill-1", "alpha");
    const version = (id: string) => ({
      id,
      skillId: "skill-1",
      version: 1,
      fingerprint: "fingerprint",
      sizeBytes: 10,
      fileCount: 1,
      publishedBy: "dev@example.com",
      r2Key: `versions/skill-1/${id}.zip`,
      createdAt: NOW
    });
    db.insert(skillVersions).values(version("version-1")).run();
    expect(() => db.insert(skillVersions).values(version("version-2")).run()).toThrow();
  });

  test("skills を消すと版とファイルも消える", async () => {
    const { db } = setup();
    insertSkillRun(db, "skill-1", "alpha");
    db.insert(skillVersions)
      .values({
        id: "version-1",
        skillId: "skill-1",
        version: 1,
        fingerprint: "fingerprint",
        sizeBytes: 10,
        fileCount: 1,
        publishedBy: "dev@example.com",
        r2Key: "versions/skill-1/1.zip",
        createdAt: NOW
      })
      .run();
    db.insert(skillFiles)
      .values({
        versionId: "version-1",
        path: "SKILL.md",
        sizeBytes: 10,
        isText: true,
        zipOffset: 0
      })
      .run();

    db.delete(skills).run();

    expect(db.select().from(skillVersions).all()).toEqual([]);
    expect(db.select().from(skillFiles).all()).toEqual([]);
  });
});

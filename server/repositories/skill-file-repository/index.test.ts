import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { skillFiles, skills, skillVersions } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { SkillFileRepository } from "./index";

const NOW = "2026-01-01T00:00:00.000Z";
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: SkillFileRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new SkillFileRepository(testDb.db) };
}

async function insertVersion(db: SkillDb, id: string) {
  await db
    .insert(skills)
    .values({
      id: "skill-1",
      name: "alpha",
      title: "アルファ",
      description: "説明",
      latestVersion: 1,
      createdAt: NOW,
      updatedAt: NOW
    })
    .run();
  await db
    .insert(skillVersions)
    .values({
      id,
      skillId: "skill-1",
      version: 1,
      fingerprint: "fingerprint",
      sizeBytes: 10,
      fileCount: 2,
      note: null,
      publishedBy: "dev@example.com",
      r2Key: `versions/skill-1/1.zip`,
      createdAt: NOW
    })
    .run();
}

function insertFile(
  db: SkillDb,
  versionId: string,
  path: string,
  isText: boolean,
  zipOffset: number
) {
  return db.insert(skillFiles).values({ versionId, path, sizeBytes: 10, isText, zipOffset }).run();
}

describe("SkillFileRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("版のファイルをパスの順に返す", async () => {
    const { db, repository } = setup();
    await insertVersion(db, "version-1");
    await insertFile(db, "version-1", "SKILL.md", true, 0);
    await insertFile(db, "version-1", "assets/logo.bin", false, 100);

    const result = await repository.listByVersionId("version-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((file) => file.path)).toEqual(["SKILL.md", "assets/logo.bin"]);
    expect(result.value[0]).toMatchObject({ isText: true, zipOffset: 0 });
  });

  test("版とパスで 1 件を引き、無ければ null", async () => {
    const { db, repository } = setup();
    await insertVersion(db, "version-1");
    await insertFile(db, "version-1", "SKILL.md", true, 0);

    const found = await repository.findByVersionIdAndPath("version-1", "SKILL.md");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({ path: "SKILL.md", sizeBytes: 10 });

    expect(await repository.findByVersionIdAndPath("version-1", "missing.md")).toEqual({
      ok: true,
      value: null
    });
  });
});

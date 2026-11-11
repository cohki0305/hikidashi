import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { skills, skillVersions } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { SkillVersionRepository } from "./index";

const NOW = "2026-01-01T00:00:00.000Z";
const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: SkillVersionRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new SkillVersionRepository(testDb.db) };
}

async function insertSkill(db: SkillDb, id: string, name: string) {
  await db
    .insert(skills)
    .values({
      id,
      name,
      title: `${name} の見出し`,
      description: `${name} の説明`,
      latestVersion: 2,
      createdAt: NOW,
      updatedAt: NOW
    })
    .run();
}

async function insertVersion(db: SkillDb, skillId: string, version: number) {
  await db
    .insert(skillVersions)
    .values({
      id: `${skillId}-v${version}`,
      skillId,
      version,
      fingerprint: `fingerprint-${version}`,
      sizeBytes: version * 10,
      fileCount: version,
      note: null,
      publishedBy: "dev@example.com",
      r2Key: `versions/${skillId}/${version}.zip`,
      createdAt: NOW
    })
    .run();
}

describe("SkillVersionRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("版を新しい順に返す", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha");
    await insertVersion(db, "skill-1", 1);
    await insertVersion(db, "skill-1", 2);

    const result = await repository.listBySkillId("skill-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((version) => version.version)).toEqual([2, 1]);
  });

  test("skill_id と版番号で 1 件を引き、無ければ null", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha");
    await insertVersion(db, "skill-1", 1);
    await insertVersion(db, "skill-1", 2);

    const found = await repository.findBySkillIdAndVersion("skill-1", 1);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({ id: "skill-1-v1", version: 1, sizeBytes: 10 });

    expect(await repository.findBySkillIdAndVersion("skill-1", 9)).toEqual({
      ok: true,
      value: null
    });
  });

  test("複数の skill_id の版をまとめて返し、空の一覧は空を返す", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha");
    await insertSkill(db, "skill-2", "beta");
    await insertVersion(db, "skill-1", 1);
    await insertVersion(db, "skill-2", 1);
    await insertVersion(db, "skill-2", 2);

    const result = await repository.listBySkillIds(["skill-1", "skill-2"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);

    expect(await repository.listBySkillIds([])).toEqual({ ok: true, value: [] });
  });

  test("100 件を超える skill_id でも分けて引き、全部返す", async () => {
    const { db, repository } = setup();
    const skillIds: string[] = [];
    for (let index = 0; index < 120; index++) {
      const skillId = `skill-${index}`;
      skillIds.push(skillId);
      await insertSkill(db, skillId, `skill-${index}`);
      await insertVersion(db, skillId, 1);
    }

    const result = await repository.listBySkillIds(skillIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(120);
    expect(new Set(result.value.map((version) => version.skillId)).size).toBe(120);
  });
});

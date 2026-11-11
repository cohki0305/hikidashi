import { afterEach, describe, expect, test } from "bun:test";
import type { SkillDb } from "@/server/db";
import { skills } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { SkillRepository } from "./index";

const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: SkillRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new SkillRepository(testDb.db) };
}

function insertSkill(db: SkillDb, id: string, name: string, updatedAt: string) {
  return db.insert(skills).values({
    id,
    name,
    title: `${name} の見出し`,
    description: `${name} の説明`,
    latestVersion: 1,
    createdAt: updatedAt,
    updatedAt
  });
}

describe("SkillRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("updated_at の新しい順に返す", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha", "2026-01-01T00:00:00.000Z").run();
    await insertSkill(db, "skill-2", "beta", "2026-03-01T00:00:00.000Z").run();
    await insertSkill(db, "skill-3", "gamma", "2026-02-01T00:00:00.000Z").run();

    const result = await repository.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((skill) => skill.name)).toEqual(["beta", "gamma", "alpha"]);
  });

  test("名前で 1 件を引き、無ければ null", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha", "2026-01-01T00:00:00.000Z").run();

    const found = await repository.findByName("alpha");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({ id: "skill-1", name: "alpha", latestVersion: 1 });

    const missing = await repository.findByName("missing");
    expect(missing).toEqual({ ok: true, value: null });
  });

  test("複数の名前をまとめて引き、無い名前は含めない", async () => {
    const { db, repository } = setup();
    await insertSkill(db, "skill-1", "alpha", "2026-01-01T00:00:00.000Z").run();
    await insertSkill(db, "skill-2", "beta", "2026-02-01T00:00:00.000Z").run();

    const result = await repository.findByNames(["alpha", "beta", "missing"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((skill) => skill.name).sort()).toEqual(["alpha", "beta"]);
    expect(await repository.findByNames([])).toEqual({ ok: true, value: [] });
  });
});

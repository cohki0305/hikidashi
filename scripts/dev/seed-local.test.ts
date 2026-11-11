import { describe, expect, test } from "bun:test";
import { skillFiles, skills, skillVersions } from "@/server/db/schema";
import { createFakeR2Bucket } from "@/tests/helpers/seed-skill";
import { createTestDb } from "@/tests/helpers/test-db";
import { SEED_SKILLS, seedLocalSkills } from "./seed-local";

describe("手元に入れる種データ", () => {
  test("3 件で、うち 1 件はバイナリ入り", () => {
    expect(SEED_SKILLS).toHaveLength(3);
    const withBinary = SEED_SKILLS.filter((skill) =>
      Object.values(skill.files).some((value) => value instanceof Uint8Array)
    );
    expect(withBinary).toHaveLength(1);
  });

  test("3 件を D1 と R2 に入れる", async () => {
    const { db, close } = createTestDb();
    const fake = createFakeR2Bucket();
    try {
      const outcome = await seedLocalSkills({ db, bucket: fake.bucket });

      expect(outcome.seeded).toEqual(SEED_SKILLS.map((skill) => skill.name));
      expect(outcome.skipped).toEqual([]);

      const skillRows = await db.select().from(skills).all();
      expect(skillRows.map((row) => row.name).sort()).toEqual(
        SEED_SKILLS.map((skill) => skill.name).sort()
      );

      const versionRows = await db.select().from(skillVersions).all();
      expect(versionRows.length).toBeGreaterThanOrEqual(3);
      for (const row of versionRows) expect(fake.objects.has(row.r2Key)).toBe(true);

      const fileRows = await db.select().from(skillFiles).all();
      const binary = fileRows.find((row) => row.path.endsWith(".bin"));
      expect(binary?.isText).toBe(false);
      expect(fileRows.some((row) => row.isText)).toBe(true);
    } finally {
      close();
    }
  });

  test("2 回目は既存を飛ばして増やさない", async () => {
    const { db, close } = createTestDb();
    const fake = createFakeR2Bucket();
    try {
      await seedLocalSkills({ db, bucket: fake.bucket });
      const second = await seedLocalSkills({ db, bucket: fake.bucket });

      expect(second.seeded).toEqual([]);
      expect(second.skipped).toEqual(SEED_SKILLS.map((skill) => skill.name));
      expect(await db.select().from(skills).all()).toHaveLength(3);
    } finally {
      close();
    }
  });
});

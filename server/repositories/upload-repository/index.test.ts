import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { skills, uploads } from "@/server/db/schema";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { UploadRepository } from "./index";

const openDbs: TestDb[] = [];

function setup(): { db: SkillDb; repository: UploadRepository } {
  const testDb = createTestDb();
  openDbs.push(testDb);
  return { db: testDb.db, repository: new UploadRepository(testDb.db) };
}

async function insertUpload(
  db: SkillDb,
  id: string,
  status: "pending" | "used" | "expired",
  expiresAt: string
) {
  await db
    .insert(uploads)
    .values({
      id,
      r2Key: `uploads/${id}.zip`,
      createdBy: "dev@example.com",
      status,
      expiresAt,
      createdAt: "2026-01-01T00:00:00.000Z"
    })
    .run();
}

async function statusOf(db: SkillDb, id: string) {
  return await db.select().from(uploads).where(eq(uploads.id, id)).get();
}

describe("UploadRepository", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("pending の受け皿を作り、id で引ける", async () => {
    const { repository } = setup();

    const created = await repository.insertPending({
      id: "upload-1",
      r2Key: "uploads/upload-1.zip",
      createdBy: "dev@example.com",
      expiresAt: "2026-01-01T00:30:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    expect(created.ok).toBe(true);
    const found = await repository.findById("upload-1");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      id: "upload-1",
      r2Key: "uploads/upload-1.zip",
      createdBy: "dev@example.com",
      status: "pending"
    });

    expect(await repository.findById("missing")).toEqual({ ok: true, value: null });
  });

  test("期限切れの pending だけを古い順に、上限まで返す", async () => {
    const { db, repository } = setup();
    await insertUpload(db, "expired-1", "pending", "2026-01-01T00:10:00.000Z");
    await insertUpload(db, "expired-2", "pending", "2026-01-01T00:20:00.000Z");
    await insertUpload(db, "future", "pending", "2026-01-01T02:00:00.000Z");
    await insertUpload(db, "used", "used", "2026-01-01T00:10:00.000Z");

    const result = await repository.listExpiredPending("2026-01-01T01:00:00.000Z", 100);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((row) => row.id)).toEqual(["expired-1", "expired-2"]);
  });

  test("markUsedStatement と commit で used にし、markExpired で expired にする", async () => {
    const { db, repository } = setup();
    await insertUpload(db, "upload-1", "pending", "2026-01-01T00:30:00.000Z");
    await insertUpload(db, "upload-2", "pending", "2026-01-01T00:30:00.000Z");

    const committed = await repository.commit([repository.markUsedStatement("upload-1")]);
    expect(committed.ok).toBe(true);
    expect((await statusOf(db, "upload-1"))?.status).toBe("used");

    const expired = await repository.markExpired("upload-2");
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.value).toBe(true);
    expect((await statusOf(db, "upload-2"))?.status).toBe("expired");
  });

  test("markUsedStatement と markExpired は pending 以外を変えない", async () => {
    const { db, repository } = setup();
    await insertUpload(db, "used", "used", "2026-01-01T00:30:00.000Z");
    await insertUpload(db, "expired", "expired", "2026-01-01T00:30:00.000Z");

    expect(await repository.markUsedIfPending("used")).toEqual({ ok: true, value: false });
    expect(await repository.markUsedIfPending("expired")).toEqual({ ok: true, value: false });
    expect((await statusOf(db, "used"))?.status).toBe("used");
    expect((await statusOf(db, "expired"))?.status).toBe("expired");

    const expired = await repository.markExpired("used");
    expect(expired).toEqual({ ok: true, value: false });
    expect((await statusOf(db, "used"))?.status).toBe("used");
  });

  test("commit は skills.name と skill_versions の UNIQUE 違反だけを details で知らせる", async () => {
    const { db, repository } = setup();
    await db
      .insert(skills)
      .values({
        id: "skill-1",
        name: "alpha",
        title: "アルファ",
        description: "見本です",
        latestVersion: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
      .run();

    const result = await repository.commit([
      db.insert(skills).values({
        id: "skill-2",
        name: "alpha",
        title: "アルファ",
        description: "見本です",
        latestVersion: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("upstream");
    expect(result.details).toMatchObject({ unique: true });

    await repository.insertPending({
      id: "upload-1",
      r2Key: "uploads/upload-1.zip",
      createdBy: "dev@example.com",
      expiresAt: "2026-01-01T00:30:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const other = await repository.commit([
      repository.insertPendingStatement({
        id: "upload-1",
        r2Key: "uploads/upload-1.zip",
        createdBy: "dev@example.com",
        expiresAt: "2026-01-01T00:30:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    ]);

    expect(other).toMatchObject({ ok: false, kind: "upstream" });
    if (other.ok) return;
    expect(other.details).toBeUndefined();
  });
});

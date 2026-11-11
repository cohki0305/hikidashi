import { afterEach, describe, expect, test } from "bun:test";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import { createFakeR2Bucket, seedSkill } from "@/tests/helpers/seed-skill";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { SkillService } from "./index";

const openDbs: TestDb[] = [];

function setup(claudeAiMaxBytes?: number) {
  const testDb = createTestDb();
  openDbs.push(testDb);
  const fake = createFakeR2Bucket();
  const service = makeService(testDb, fake.bucket, claudeAiMaxBytes);
  return { testDb, fake, service };
}

function makeService(testDb: TestDb, bucket: R2Bucket, claudeAiMaxBytes?: number) {
  return new SkillService({
    skills: new SkillRepository(testDb.db),
    versions: new SkillVersionRepository(testDb.db),
    files: new SkillFileRepository(testDb.db),
    bucket,
    claudeAiMaxBytes
  });
}

const TEXT_FILES = {
  "SKILL.md": "# 見本のスキル\n",
  "assets/logo.bin": new Uint8Array([0, 1, 2, 3, 254, 255]),
  "scripts/run.md": "手順を書いたファイル\n"
};

describe("SkillService.list", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("新しい順に並べ、name・title・description の部分一致で絞り込む", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES,
      publishedBy: "alpha@example.com",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    await seedSkill(testDb.db, fake.bucket, {
      name: "beta",
      title: "ベータ",
      files: TEXT_FILES,
      publishedBy: "beta@example.com",
      updatedAt: "2026-02-01T00:00:00.000Z"
    });

    const all = await service.list("");
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.map((skill) => skill.name)).toEqual(["beta", "alpha"]);
    expect(all.value[0]).toMatchObject({
      title: "ベータ",
      author: "beta@example.com",
      latestVersion: 1,
      updatedAt: "2026-02-01T00:00:00.000Z",
      claudeCodeOnly: false
    });
    expect(all.value[0]?.sizeBytes).toBeGreaterThan(0);

    const byTitle = await service.list("アル");
    expect(byTitle.ok).toBe(true);
    if (!byTitle.ok) return;
    expect(byTitle.value.map((skill) => skill.name)).toEqual(["alpha"]);

    const byName = await service.list("BET");
    expect(byName.ok).toBe(true);
    if (!byName.ok) return;
    expect(byName.value.map((skill) => skill.name)).toEqual(["beta"]);

    const byDescription = await service.list("ベータの説明");
    expect(byDescription.ok).toBe(true);
    if (!byDescription.ok) return;
    expect(byDescription.value.map((skill) => skill.name)).toEqual(["beta"]);

    const none = await service.list("見つからない");
    expect(none.ok).toBe(true);
    if (!none.ok) return;
    expect(none.value).toEqual([]);
  });

  test("claudeCodeOnly は CLAUDE_AI_MAX_BYTES との比較で切り替わる", async () => {
    const { testDb, fake } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES
    });

    const limited = makeService(testDb, fake.bucket, 1);
    const limitedList = await limited.list("");
    expect(limitedList.ok).toBe(true);
    if (!limitedList.ok) return;
    expect(limitedList.value[0]?.claudeCodeOnly).toBe(true);

    const roomy = makeService(testDb, fake.bucket, 1_000_000);
    const roomyList = await roomy.list("");
    expect(roomyList.ok).toBe(true);
    if (!roomyList.ok) return;
    expect(roomyList.value[0]?.claudeCodeOnly).toBe(false);
  });
});

describe("SkillService.show", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("最新版のファイルと、新しい順の版を返す", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES,
      versions: 2,
      publishedBy: "dev@example.com"
    });

    const detail = await service.show("alpha");
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    expect(detail.value.skill).toMatchObject({
      name: "alpha",
      title: "アルファ",
      latestVersion: 2,
      author: "dev@example.com"
    });
    expect(detail.value.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(detail.value.versions[0]).toMatchObject({ note: "2 版" });
    expect(detail.value.versions[0]?.fingerprint).not.toBe("");
    expect(detail.value.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "assets/logo.bin",
      "scripts/run.md"
    ]);
    expect(detail.value.files.map((file) => file.isText)).toEqual([true, false, true]);
    expect(detail.value.files[1]?.sizeBytes).toBe(6);
  });

  test("無い名前は notFound", async () => {
    const { service } = setup();

    const detail = await service.show("missing");

    expect(detail).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("SkillService.preview", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("テキストは中身を返す", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES
    });

    expect(await service.preview("alpha", 1, "SKILL.md")).toEqual({
      ok: true,
      value: "# 見本のスキル\n"
    });
    expect(await service.preview("alpha", 1, "scripts/run.md")).toEqual({
      ok: true,
      value: "手順を書いたファイル\n"
    });
  });

  test("テキストでないファイル・256KB 超・無いパスは notFound", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: {
        ...TEXT_FILES,
        "big.txt": "a".repeat(256 * 1024 + 1)
      }
    });

    expect(await service.preview("alpha", 1, "assets/logo.bin")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
    expect(await service.preview("alpha", 1, "big.txt")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
    expect(await service.preview("alpha", 1, "missing.md")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });

  test("無い版は notFound", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES
    });

    expect(await service.preview("alpha", 9, "SKILL.md")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });
});

describe("SkillService.download", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("R2 の stream をそのまま返す", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES
    });

    const downloaded = await service.download("alpha", 1);
    expect(downloaded.ok).toBe(true);
    if (!downloaded.ok) return;
    expect(downloaded.value.filename).toBe("alpha-v1.zip");
    expect(downloaded.value.size).toBeGreaterThan(0);
    const expectedBody = fake.lastBody;
    if (expectedBody === null) throw new Error("偽の R2 が body を返していません");
    expect(downloaded.value.body).toBe(expectedBody);
  });

  test("無い名前・無い版は notFound", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES
    });

    expect(await service.download("missing", 1)).toMatchObject({ ok: false, kind: "not_found" });
    expect(await service.download("alpha", 9)).toMatchObject({ ok: false, kind: "not_found" });
  });
});

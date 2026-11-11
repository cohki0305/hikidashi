import { afterEach, describe, expect, test } from "bun:test";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import { makeZip } from "@/tests/helpers/make-zip";
import { createFakeR2Bucket, seedSkill } from "@/tests/helpers/seed-skill";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { PREVIEW_MAX_BYTES, SkillService } from "./index";

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

/** 中央ディレクトリの uncompressed size だけを書き換える（DB と zip のずれを作る）。 */
function patchUncompressedSize(zip: Uint8Array, path: string, size: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const eocd = out.length - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error("EOCD がありません");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("中央ディレクトリの署名が不正です");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(out.subarray(offset + 46, offset + 46 + nameLength));
    if (name === path) {
      view.setUint32(offset + 24, size, true);
      return out;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`エントリがありません: ${path}`);
}

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

describe("SkillService.latestByNames", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("名前の一覧から最新版の指紋をまとめて返し、無い名前は含めない", async () => {
    const { testDb, fake, service } = setup();
    await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: TEXT_FILES,
      versions: 2
    });
    await seedSkill(testDb.db, fake.bucket, {
      name: "beta",
      title: "ベータ",
      files: TEXT_FILES
    });

    const alpha = await service.show("alpha");
    expect(alpha.ok).toBe(true);
    if (!alpha.ok) return;
    const beta = await service.show("beta");
    expect(beta.ok).toBe(true);
    if (!beta.ok) return;

    const latest = await service.latestByNames(["alpha", "beta", "missing"]);
    expect(latest.ok).toBe(true);
    if (!latest.ok) return;
    expect([...latest.value].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        name: "alpha",
        latestVersion: 2,
        fingerprint: alpha.value.versions[0]?.fingerprint
      },
      {
        name: "beta",
        latestVersion: 1,
        fingerprint: beta.value.versions[0]?.fingerprint
      }
    ]);
    expect(await service.latestByNames([])).toEqual({ ok: true, value: [] });
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

  test("zip の展開後サイズが 256KB を超えるなら notFound（DB とずれていても弾く）", async () => {
    const { testDb, fake, service } = setup();
    const { skillId } = await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: { "SKILL.md": "a" }
    });
    const key = `versions/${skillId}/1.zip`;
    fake.objects.set(key, makeZip([{ path: "SKILL.md", data: "a".repeat(PREVIEW_MAX_BYTES + 1) }]));

    expect(await service.preview("alpha", 1, "SKILL.md")).toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });

  test("zip の申告より実際の展開が大きいときも 256KB で打ち切って notFound", async () => {
    const { testDb, fake, service } = setup();
    const { skillId } = await seedSkill(testDb.db, fake.bucket, {
      name: "alpha",
      title: "アルファ",
      files: { "SKILL.md": "a" }
    });
    const key = `versions/${skillId}/1.zip`;
    const huge = makeZip([{ path: "SKILL.md", data: "a".repeat(PREVIEW_MAX_BYTES + 1) }]);
    fake.objects.set(key, patchUncompressedSize(huge, "SKILL.md", 10));

    expect(await service.preview("alpha", 1, "SKILL.md")).toMatchObject({
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

import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { skillFiles, skills, skillVersions, uploads } from "@/server/db/schema";
import type { R2S3Config } from "@/server/lib/r2/presign";
import { type Result, upstream } from "@/server/lib/result";
import { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import { SkillRepository } from "@/server/repositories/skill-repository";
import { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import { type BatchStatement, UploadRepository } from "@/server/repositories/upload-repository";
import { type MakeZipEntry, makeZip } from "@/tests/helpers/make-zip";
import { createFakeR2Bucket, type FakeR2Bucket } from "@/tests/helpers/seed-skill";
import { createTestDb, type TestDb } from "@/tests/helpers/test-db";
import { PublishService } from "./index";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const BUCKET = "hikidashi-skills";
const CONFIG: R2S3Config = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: BUCKET
};

const openDbs: TestDb[] = [];

type CopyCall = { fromKey: string; toKey: string };

function copyFetcher(fake: FakeR2Bucket) {
  const calls: CopyCall[] = [];
  const fetchImpl = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const prefix = `/${BUCKET}/`;
    const toKey = decodeURIComponent(url.pathname).slice(prefix.length);
    const source = request.headers.get("x-amz-copy-source") ?? "";
    const fromKey = decodeURIComponent(source).slice(prefix.length);
    calls.push({ fromKey, toKey });
    const bytes = fake.objects.get(fromKey);
    if (bytes === undefined) return new Response(null, { status: 404 });
    fake.objects.set(toKey, bytes);
    return new Response(null, { status: 200 });
  };
  return { fetchImpl, calls };
}

class FailingUploadRepository extends UploadRepository {
  override async commit(_statements: readonly BatchStatement[]): Promise<Result<void>> {
    return upstream("公開の記録を保存できませんでした");
  }
}

/** コピーと記録の間に cleanupExpired が走った状況を作る。 */
class ExpiringUploadRepository extends UploadRepository {
  override async commit(statements: readonly BatchStatement[]): Promise<Result<void>> {
    const id = this.expiringId;
    if (id !== undefined) await this.markExpired(id);
    return await super.commit(statements);
  }
  expiringId: string | undefined;
}

function setup(
  options: {
    now?: Date;
    s3?: R2S3Config | null;
    failCommit?: boolean;
    expireBeforeUse?: boolean;
  } = {}
) {
  const testDb = createTestDb();
  openDbs.push(testDb);
  const fake = createFakeR2Bucket();
  const { fetchImpl, calls } = copyFetcher(fake);
  const uploads = options.failCommit
    ? new FailingUploadRepository(testDb.db)
    : options.expireBeforeUse
      ? new ExpiringUploadRepository(testDb.db)
      : new UploadRepository(testDb.db);
  const service = new PublishService({
    skills: new SkillRepository(testDb.db),
    versions: new SkillVersionRepository(testDb.db),
    files: new SkillFileRepository(testDb.db),
    uploads,
    bucket: fake.bucket,
    s3: options.s3 === null ? undefined : (options.s3 ?? CONFIG),
    fetchImpl,
    now: () => options.now ?? NOW
  });
  return { testDb, fake, service, calls, uploads };
}

const SKILL_MD = (name: string, description: string) =>
  ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`].join("\n");

function skillZip(name: string, extra: MakeZipEntry[] = [], description = "見本のスキルです") {
  return makeZip([{ path: "SKILL.md", data: SKILL_MD(name, description) }, ...extra]);
}

async function uploadZip(
  fake: FakeR2Bucket,
  service: PublishService,
  email: string,
  zip: Uint8Array
) {
  const begun = await service.begin(email);
  if (!begun.ok) throw new Error(begun.message);
  fake.objects.set(`uploads/${begun.value.uploadId}.zip`, zip);
  return begun.value.uploadId;
}

async function skillRows(db: SkillDb) {
  return await db.select().from(skills).all();
}

async function versionRows(db: SkillDb, skillId: string) {
  return await db.select().from(skillVersions).where(eq(skillVersions.skillId, skillId)).all();
}

async function fileRows(db: SkillDb, versionId: string) {
  return await db.select().from(skillFiles).where(eq(skillFiles.versionId, versionId)).all();
}

async function uploadRow(db: SkillDb, id: string) {
  return await db.select().from(uploads).where(eq(uploads.id, id)).get();
}

describe("PublishService.begin", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("pending の受け皿を作り、30 分有効の署名付き URL を返す", async () => {
    const { testDb, service } = setup();

    const result = await service.begin("dev@example.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxBytes).toBe(209_715_200);
    expect(result.value.expiresAt).toBe("2026-01-01T00:30:00.000Z");

    const url = new URL(result.value.uploadUrl);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(decodeURIComponent(url.pathname)).toBe(
      `/hikidashi-skills/uploads/${result.value.uploadId}.zip`
    );

    expect(await uploadRow(testDb.db, result.value.uploadId)).toMatchObject({
      r2Key: `uploads/${result.value.uploadId}.zip`,
      createdBy: "dev@example.com",
      status: "pending",
      expiresAt: "2026-01-01T00:30:00.000Z"
    });
  });

  test("S3 の設定が無ければ受け皿を作らずエラーを返す", async () => {
    const { testDb, service } = setup({ s3: null });

    const result = await service.begin("dev@example.com");

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    expect(testDb.db.select().from(uploads).all()).toEqual([]);
  });
});

describe("PublishService.finish", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("新しいスキルは版 1 で公開し、zip を版の置き場へ移す", async () => {
    const { testDb, fake, service, calls } = setup();
    const zip = skillZip("alpha", [{ path: "scripts/run.md", data: "手順\n" }]);
    const uploadId = await uploadZip(fake, service, "dev@example.com", zip);

    const result = await service.finish("dev@example.com", uploadId, "最初の版");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.status !== "published") throw new Error("公開されていません");
    expect(result.value).toMatchObject({
      status: "published",
      name: "alpha",
      version: 1,
      fileCount: 2,
      sizeBytes: zip.length
    });

    const skill = (await skillRows(testDb.db))[0];
    if (!skill) throw new Error("skills の行がありません");
    expect(skill).toMatchObject({
      name: "alpha",
      title: "alpha",
      description: "見本のスキルです",
      latestVersion: 1
    });
    const versions = await versionRows(testDb.db, skill.id);
    expect(versions).toHaveLength(1);
    expect(result.value.fingerprint).toBe(versions[0]?.fingerprint);
    expect(versions[0]).toMatchObject({
      version: 1,
      note: "最初の版",
      publishedBy: "dev@example.com",
      sizeBytes: zip.length
    });
    const versionKey = versions[0]?.r2Key ?? "";
    expect(versionKey).toStartWith(`versions/${skill.id}/1-`);
    expect(versionKey).toEndWith(".zip");
    expect((await fileRows(testDb.db, versions[0]?.id ?? "")).map((file) => file.path)).toEqual([
      "SKILL.md",
      "scripts/run.md"
    ]);

    expect(calls).toEqual([{ fromKey: `uploads/${uploadId}.zip`, toKey: versionKey }]);
    expect(fake.objects.has(versionKey)).toBe(true);
    expect(fake.objects.has(`uploads/${uploadId}.zip`)).toBe(false);
    expect((await uploadRow(testDb.db, uploadId))?.status).toBe("used");
  });

  test("同じ中身を圧縮率と順番を変えて公開しても unchanged で版が増えない", async () => {
    const { testDb, fake, service, calls } = setup();
    const entries: MakeZipEntry[] = [
      { path: "SKILL.md", data: SKILL_MD("alpha", "見本のスキルです") },
      { path: "scripts/run.md", data: "手順\n" }
    ];
    const firstId = await uploadZip(fake, service, "dev@example.com", makeZip(entries));
    const first = await service.finish("dev@example.com", firstId);
    expect(first.ok).toBe(true);
    const skillId = (await skillRows(testDb.db))[0]?.id ?? "";
    calls.length = 0;

    const reordered = makeZip([
      { path: "scripts/run.md", data: "手順\n", store: true },
      { path: "SKILL.md", data: SKILL_MD("alpha", "見本のスキルです"), store: true }
    ]);
    const secondId = await uploadZip(fake, service, "dev@example.com", reordered);
    const second = await service.finish("dev@example.com", secondId);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual({ status: "unchanged", name: "alpha", version: 1 });
    expect(await versionRows(testDb.db, skillId)).toHaveLength(1);
    expect(calls).toEqual([]);
    expect((await uploadRow(testDb.db, secondId))?.status).toBe("used");
    expect(fake.objects.has(`uploads/${secondId}.zip`)).toBe(false);
  });

  test("違う中身は版 2 として公開する", async () => {
    const { testDb, fake, service, calls } = setup();
    const firstId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    await service.finish("dev@example.com", firstId);
    const skillId = (await skillRows(testDb.db))[0]?.id ?? "";
    calls.length = 0;

    const secondId = await uploadZip(
      fake,
      service,
      "dev@example.com",
      skillZip("alpha", [{ path: "extra.md", data: "追加\n" }], "説明を変えました")
    );
    const second = await service.finish("dev@example.com", secondId);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toMatchObject({ status: "published", name: "alpha", version: 2 });
    expect(await versionRows(testDb.db, skillId)).toHaveLength(2);
    expect((await skillRows(testDb.db))[0]).toMatchObject({
      latestVersion: 2,
      description: "説明を変えました"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fromKey).toBe(`uploads/${secondId}.zip`);
    expect(calls[0]?.toKey).toStartWith(`versions/${skillId}/2-`);
  });

  test("受け皿が無い・他人のもの・使用済み・期限切れはそれぞれ分かる文言で断る", async () => {
    const { testDb, fake, service } = setup();

    expect(await service.finish("dev@example.com", "missing")).toEqual({
      ok: false,
      kind: "not_found",
      message: "この受け皿は見つかりません"
    });

    const begun = await service.begin("other@example.com");
    if (!begun.ok) throw new Error(begun.message);
    expect(await service.finish("dev@example.com", begun.value.uploadId)).toMatchObject({
      ok: false,
      kind: "not_found",
      message: "この受け皿は見つかりません"
    });

    const usedId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    await service.finish("dev@example.com", usedId);
    expect(await service.finish("dev@example.com", usedId)).toMatchObject({
      ok: false,
      kind: "invalid",
      message: "受け皿の期限が切れました。もう一度 begin_publish からやり直してください"
    });

    const expiredId = await uploadZip(fake, service, "dev@example.com", skillZip("beta"));
    testDb.db
      .update(uploads)
      .set({ expiresAt: "2025-12-31T23:59:59.000Z" })
      .where(eq(uploads.id, expiredId))
      .run();
    expect(await service.finish("dev@example.com", expiredId)).toMatchObject({
      ok: false,
      kind: "invalid",
      message: "受け皿の期限が切れました。もう一度 begin_publish からやり直してください"
    });
  });

  test("R2 に zip が届いていなければ断る", async () => {
    const { testDb, service } = setup();
    const begun = await service.begin("dev@example.com");
    if (!begun.ok) throw new Error(begun.message);

    expect(await service.finish("dev@example.com", begun.value.uploadId)).toMatchObject({
      ok: false,
      kind: "invalid",
      message: "zip がまだ届いていません"
    });
    expect((await uploadRow(testDb.db, begun.value.uploadId))?.status).toBe("pending");
  });

  test("上限を超える zip は検査せずに断る", async () => {
    const { testDb, fake, service } = setup();
    const begun = await service.begin("dev@example.com");
    if (!begun.ok) throw new Error(begun.message);
    const bucket = {
      ...fake.bucket,
      head: async () => ({ size: 209_715_201 })
    } as unknown as R2Bucket;
    const big = new PublishService({
      skills: new SkillRepository(testDb.db),
      versions: new SkillVersionRepository(testDb.db),
      files: new SkillFileRepository(testDb.db),
      uploads: new UploadRepository(testDb.db),
      bucket,
      s3: CONFIG,
      now: () => NOW
    });

    const result = await big.finish("dev@example.com", begun.value.uploadId);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    if (result.ok) return;
    expect(result.message).toContain("大き");
  });

  test("同時公開の UNIQUE 違反は conflict にし、受け皿は pending のまま残す", async () => {
    const { testDb, fake, service, calls } = setup();
    const firstId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    await service.finish("dev@example.com", firstId);
    const skill = (await skillRows(testDb.db))[0];
    if (!skill) throw new Error("skills の行がありません");

    const secondId = await uploadZip(
      fake,
      service,
      "dev@example.com",
      skillZip("alpha", [{ path: "extra.md", data: "追加\n" }])
    );
    const otherKey = `versions/${skill.id}/2-other-version-2.zip`;
    const otherZip = new TextEncoder().encode("他人の版 2 の zip");
    fake.objects.set(otherKey, otherZip);
    await testDb.db
      .insert(skillVersions)
      .values({
        id: "other-version-2",
        skillId: skill.id,
        version: 2,
        fingerprint: "other",
        sizeBytes: otherZip.length,
        fileCount: 1,
        note: null,
        publishedBy: "other@example.com",
        r2Key: otherKey,
        createdAt: NOW.toISOString()
      })
      .run();

    const result = await service.finish("dev@example.com", secondId);

    expect(result).toMatchObject({
      ok: false,
      kind: "conflict",
      message: "同時に公開されました。もう一度公開してください。"
    });
    expect((await uploadRow(testDb.db, secondId))?.status).toBe("pending");
    // 負けた側は自分がコピーした版だけを消し、先に公開した他人の版 2 は残す。
    expect(fake.objects.has(calls.at(-1)?.toKey ?? "")).toBe(false);
    expect(fake.objects.get(otherKey)).toEqual(otherZip);
    expect(
      (await versionRows(testDb.db, skill.id)).find((version) => version.version === 2)?.fingerprint
    ).toBe("other");
  });

  test("コピーの後に受け皿が期限切れ扱いになっても、コピー済みの版は正しく登録される", async () => {
    const { testDb, fake, service, calls, uploads } = setup({ expireBeforeUse: true });
    const uploadId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    if (uploads instanceof ExpiringUploadRepository) uploads.expiringId = uploadId;

    const result = await service.finish("dev@example.com", uploadId);

    expect(result).toMatchObject({ ok: true, value: { status: "published", version: 1 } });
    expect(await skillRows(testDb.db)).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(fake.objects.has(calls[0]?.toKey ?? "")).toBe(true);
  });

  test("D1 の書き込みが失敗したらコピー済みの版の zip を消す", async () => {
    const { testDb, fake, service, calls } = setup({ failCommit: true });
    const uploadId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));

    const result = await service.finish("dev@example.com", uploadId);

    expect(result).toMatchObject({ ok: false, kind: "upstream" });
    expect(calls).toHaveLength(1);
    const copied = calls[0]?.toKey ?? "";
    expect(copied).toStartWith("versions/");
    expect(fake.objects.has(copied)).toBe(false);
    expect(fake.objects.has(`uploads/${uploadId}.zip`)).toBe(true);
    expect((await uploadRow(testDb.db, uploadId))?.status).toBe("pending");
  });

  test("S3 の設定が無ければ公開しない", async () => {
    const setupResult = setup();
    const { testDb, fake, service: configured } = setupResult;
    const uploadId = await uploadZip(fake, configured, "dev@example.com", skillZip("alpha"));
    const withoutS3 = new PublishService({
      skills: new SkillRepository(testDb.db),
      versions: new SkillVersionRepository(testDb.db),
      files: new SkillFileRepository(testDb.db),
      uploads: new UploadRepository(testDb.db),
      bucket: fake.bucket,
      fetchImpl: copyFetcher(fake).fetchImpl,
      now: () => NOW
    });

    expect(await withoutS3.finish("dev@example.com", uploadId)).toMatchObject({
      ok: false,
      kind: "invalid",
      details: { missingConfig: true }
    });
    expect(await withoutS3.finish("dev@example.com", "missing")).toMatchObject({
      ok: false,
      kind: "invalid",
      details: { missingConfig: true }
    });
  });
});

describe("PublishService.cleanupExpired", () => {
  afterEach(() => {
    while (openDbs.length > 0) openDbs.pop()?.close();
  });

  test("期限切れの pending だけ zip を消して expired にし、期限内と used は触らない", async () => {
    const { testDb, fake, service } = setup();
    const expiredId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    const aliveId = await uploadZip(fake, service, "dev@example.com", skillZip("beta"));
    const usedId = await uploadZip(fake, service, "dev@example.com", skillZip("gamma"));
    await service.finish("dev@example.com", usedId);

    testDb.db
      .update(uploads)
      .set({ expiresAt: "2025-12-31T23:59:59.000Z" })
      .where(eq(uploads.id, expiredId))
      .run();
    testDb.db
      .update(uploads)
      .set({ expiresAt: "2025-12-31T23:59:59.000Z" })
      .where(eq(uploads.id, usedId))
      .run();

    const result = await service.cleanupExpired(NOW);

    expect(result).toEqual({ expired: 1 });
    expect((await uploadRow(testDb.db, expiredId))?.status).toBe("expired");
    expect(fake.objects.has(`uploads/${expiredId}.zip`)).toBe(false);
    expect((await uploadRow(testDb.db, aliveId))?.status).toBe("pending");
    expect(fake.objects.has(`uploads/${aliveId}.zip`)).toBe(true);
    expect((await uploadRow(testDb.db, usedId))?.status).toBe("used");
    expect((await uploadRow(testDb.db, usedId))?.r2Key).toBeTruthy();
  });

  test("zip の削除に失敗した受け皿は pending のままにして次回にやり直せる", async () => {
    const { testDb, fake, service } = setup();
    const uploadId = await uploadZip(fake, service, "dev@example.com", skillZip("alpha"));
    const key = `uploads/${uploadId}.zip`;
    testDb.db
      .update(uploads)
      .set({ expiresAt: "2025-12-31T23:59:59.000Z" })
      .where(eq(uploads.id, uploadId))
      .run();

    const failingService = new PublishService({
      skills: new SkillRepository(testDb.db),
      versions: new SkillVersionRepository(testDb.db),
      files: new SkillFileRepository(testDb.db),
      uploads: new UploadRepository(testDb.db),
      bucket: { ...fake.bucket, delete: async () => Promise.reject(new Error("削除失敗")) },
      s3: CONFIG,
      now: () => NOW
    });

    expect(await failingService.cleanupExpired(NOW)).toEqual({ expired: 0 });
    expect((await uploadRow(testDb.db, uploadId))?.status).toBe("pending");
    expect(fake.objects.has(key)).toBe(true);

    expect(await service.cleanupExpired(NOW)).toEqual({ expired: 1 });
    expect((await uploadRow(testDb.db, uploadId))?.status).toBe("expired");
    expect(fake.objects.has(key)).toBe(false);
  });
});

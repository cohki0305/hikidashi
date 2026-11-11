import type { SkillDb } from "@/server/db";
import { skillFiles, skills, skillVersions } from "@/server/db/schema";
import { type RangeSource, readCentralDirectory } from "@/server/lib/zip";
import { type MakeZipEntry, makeZip } from "./make-zip";

/** R2 の範囲読み出しの記録。プレビューが zip 全体を読んでいないことの確認に使う。 */
export type FakeR2Read = { key: string; offset: number; length: number };

export type FakeR2Bucket = {
  bucket: R2Bucket;
  objects: Map<string, Uint8Array>;
  reads: FakeR2Read[];
  /** get が最後に返した body。ダウンロードが R2 の stream をそのまま返すことの確認に使う。 */
  readonly lastBody: ReadableStream<Uint8Array> | null;
};

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

/** テスト用の R2 の偽物。必要なメソッド（get・head・put・delete）だけを持つ。 */
export function createFakeR2Bucket(): FakeR2Bucket {
  const objects = new Map<string, Uint8Array>();
  const reads: FakeR2Read[] = [];
  const state: { lastBody: ReadableStream<Uint8Array> | null } = { lastBody: null };

  const bucket = {
    head: async (key: string) =>
      objects.has(key) ? { size: objects.get(key)?.length ?? 0 } : null,
    get: async (
      key: string,
      options?: { range?: { offset: number; length: number } }
    ): Promise<unknown> => {
      const bytes = objects.get(key);
      if (bytes === undefined) return null;
      const range = options?.range;
      if (range) reads.push({ key, offset: range.offset, length: range.length });
      const data = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      const body = streamOf(data);
      state.lastBody = body;
      return { body, size: data.length, arrayBuffer: async () => data.buffer };
    },
    put: async (key: string, value: unknown) => {
      objects.set(key, toBytes(value));
      return {};
    },
    delete: async (key: string) => {
      objects.delete(key);
    }
  } as unknown as R2Bucket;

  return {
    bucket,
    objects,
    reads,
    get lastBody() {
      return state.lastBody;
    }
  };
}

function memorySource(bytes: Uint8Array): RangeSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.slice(offset, Math.min(bytes.length, offset + length)),
    stream: async (offset, length) =>
      streamOf(bytes.slice(offset, Math.min(bytes.length, offset + length)))
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type SeedSkillOptions = {
  name: string;
  title: string;
  files: Record<string, string | Uint8Array>;
  /** 作る版の数（既定は 1）。 */
  versions?: number;
  publishedBy?: string;
  /** 一覧の並びを決めるテスト用。既定は現在時刻。 */
  updatedAt?: string;
};

export type SeededSkill = { skillId: string; versions: number[] };

/** テスト用に、zip を作って偽の R2 に置き、D1 に版とファイルを書く。 */
export async function seedSkill(
  db: SkillDb,
  bucket: R2Bucket,
  options: SeedSkillOptions
): Promise<SeededSkill> {
  const versionCount = options.versions ?? 1;
  const publishedBy = options.publishedBy ?? "dev@example.com";
  const createdAt = new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const skillId = crypto.randomUUID();

  await db
    .insert(skills)
    .values({
      id: skillId,
      name: options.name,
      title: options.title,
      description: `${options.title}の説明`,
      latestVersion: versionCount,
      createdAt,
      updatedAt
    })
    .run();

  const zipEntries: MakeZipEntry[] = Object.entries(options.files).map(([path, data]) => ({
    path,
    data
  }));
  const versions: number[] = [];

  for (let version = 1; version <= versionCount; version++) {
    const zip = makeZip(zipEntries);
    const r2Key = `versions/${skillId}/${version}.zip`;
    await bucket.put(r2Key, zip);

    const centralDirectory = await readCentralDirectory(memorySource(zip));
    if (!centralDirectory.ok) throw new Error(centralDirectory.message);
    const versionId = `${skillId}-v${version}`;

    await db
      .insert(skillVersions)
      .values({
        id: versionId,
        skillId,
        version,
        fingerprint: await sha256Hex(zip),
        sizeBytes: zip.length,
        fileCount: centralDirectory.value.length,
        note: version === 1 ? null : `${version} 版`,
        publishedBy,
        r2Key,
        createdAt
      })
      .run();

    for (const entry of centralDirectory.value) {
      const source = options.files[entry.path];
      await db
        .insert(skillFiles)
        .values({
          versionId,
          path: entry.path,
          sizeBytes: entry.uncompressedSize,
          isText: typeof source === "string",
          zipOffset: entry.localHeaderOffset
        })
        .run();
    }

    versions.push(version);
  }

  return { skillId, versions };
}

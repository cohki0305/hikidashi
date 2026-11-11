import { copyObject, presignPut, type R2S3Config } from "@/server/lib/r2/presign";
import { conflict, invalid, notFound, ok, type Result, upstream } from "@/server/lib/result";
import { r2RangeSource } from "@/server/lib/zip";
import { type InspectedSkill, inspectSkillZip } from "@/server/lib/zip/inspect-skill";
import type { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import type { SkillRepository } from "@/server/repositories/skill-repository";
import type { SkillVersionRepository } from "@/server/repositories/skill-version-repository";
import type {
  BatchStatement,
  UploadRepository,
  UploadRow
} from "@/server/repositories/upload-repository";

/** 1 版の zip の上限（200 MB）。 */
export const MAX_UPLOAD_BYTES = 209_715_200;
/** アップロード先の署名の有効期限（30 分）。 */
const UPLOAD_TTL_SECONDS = 1800;
/** 期限切れの受け皿を片付ける件数の上限。 */
const CLEANUP_LIMIT = 100;
/** 同時公開で UNIQUE 違反になったときの文言。 */
const CONFLICT_MESSAGE = "同時に公開されました。もう一度公開してください。";
/** 受け皿が使えないときの文言。 */
const EXPIRED_MESSAGE = "受け皿の期限が切れました。もう一度 begin からやり直してください";
/** S3 の設定が無いときの文言。 */
const MISSING_CONFIG_MESSAGE = "R2 の S3 の設定が足りません";

type FetchLike = (request: Request) => Promise<Response>;

export type PublishServiceDeps = {
  skills: SkillRepository;
  versions: SkillVersionRepository;
  files: SkillFileRepository;
  uploads: UploadRepository;
  bucket: R2Bucket;
  s3?: R2S3Config;
  fetchImpl?: FetchLike;
  now?: () => Date;
};

export type FinishPublishResult =
  | {
      status: "published";
      name: string;
      version: number;
      fileCount: number;
      sizeBytes: number;
    }
  | { status: "unchanged"; name: string; version: number };

/** 公開の受け皿づくり・zip の検査・版の登録・期限切れの掃除。 */
export class PublishService {
  constructor(private readonly deps: PublishServiceDeps) {}

  /** 受け皿を作り、アップロード用の署名付き URL を返す。 */
  async begin(
    email: string
  ): Promise<Result<{ uploadId: string; uploadUrl: string; expiresAt: string; maxBytes: number }>> {
    const config = this.deps.s3;
    if (config === undefined) return invalid(MISSING_CONFIG_MESSAGE);

    const uploadId = crypto.randomUUID();
    const r2Key = `uploads/${uploadId}.zip`;
    const createdAt = (this.deps.now ?? (() => new Date()))().toISOString();
    const expiresAt = new Date(
      new Date(createdAt).getTime() + UPLOAD_TTL_SECONDS * 1000
    ).toISOString();

    let uploadUrl: string;
    try {
      uploadUrl = await presignPut(config, r2Key, UPLOAD_TTL_SECONDS);
    } catch {
      return upstream("アップロード用の URL を作れませんでした");
    }

    const inserted = await this.deps.uploads.insertPending({
      id: uploadId,
      r2Key,
      createdBy: email,
      expiresAt,
      createdAt
    });
    if (!inserted.ok) return inserted;

    return ok({ uploadId, uploadUrl, expiresAt, maxBytes: MAX_UPLOAD_BYTES });
  }

  /** アップロードされた zip を検査し、新しい版として登録する。 */
  async finish(
    email: string,
    uploadId: string,
    note?: string
  ): Promise<Result<FinishPublishResult>> {
    const now = this.deps.now ?? (() => new Date());
    const uploadResult = await this.deps.uploads.findById(uploadId);
    if (!uploadResult.ok) return uploadResult;
    const upload = uploadResult.value;
    if (upload === null || upload.createdBy !== email)
      return notFound("この受け皿は見つかりません");
    if (upload.status !== "pending" || Date.parse(upload.expiresAt) <= now().getTime())
      return invalid(EXPIRED_MESSAGE);

    const config = this.deps.s3;
    if (config === undefined) return invalid(MISSING_CONFIG_MESSAGE);

    const head = await this.head(upload);
    if (!head.ok) return head;
    if (head.value === null) return invalid("zip がまだ届いていません");
    if (head.value > MAX_UPLOAD_BYTES) return invalid("zip が大きすぎます（200MB まで）");

    const inspected = await this.inspect(upload);
    if (!inspected.ok) return inspected;
    const skill = inspected.value;

    const skillResult = await this.deps.skills.findByName(skill.name);
    if (!skillResult.ok) return skillResult;
    const existing = skillResult.value;

    const latestResult =
      existing === null
        ? ok(null)
        : await this.deps.versions.findBySkillIdAndVersion(existing.id, existing.latestVersion);
    if (!latestResult.ok) return latestResult;
    const latest = latestResult.value;

    if (latest !== null && latest.fingerprint === skill.fingerprint) {
      return this.unchanged(uploadId, upload.r2Key, skill.name, latest.version);
    }

    const skillId = existing?.id ?? crypto.randomUUID();
    const version = (existing?.latestVersion ?? 0) + 1;
    const versionId = crypto.randomUUID();
    const versionKey = `versions/${skillId}/${version}-${versionId}.zip`;
    const createdAt = now().toISOString();

    const copied = await copyObject(config, upload.r2Key, versionKey, this.deps.fetchImpl ?? fetch);
    if (!copied.ok) return copied;

    const marked = await this.deps.uploads.markUsedIfPending(upload.id);
    if (!marked.ok || !marked.value) {
      await this.deleteObject(versionKey);
      return marked.ok ? invalid(EXPIRED_MESSAGE) : marked;
    }

    const statements = this.buildStatements({
      skillId,
      versionId,
      version,
      versionKey,
      createdAt,
      publishedBy: email,
      note: note ?? null,
      existing,
      skill
    });
    const committed = await this.deps.uploads.commit(statements);
    if (!committed.ok) {
      await this.deleteObject(versionKey);
      await this.deps.uploads.restorePending(upload.id);
      return committed.details?.unique === true ? conflict(CONFLICT_MESSAGE) : committed;
    }

    await this.deleteObject(upload.r2Key);
    return ok({
      status: "published",
      name: skill.name,
      version,
      fileCount: skill.fileCount,
      sizeBytes: skill.sizeBytes
    });
  }

  /** 期限切れの受け皿を最大 100 件片付ける。 */
  async cleanupExpired(now: Date): Promise<{ expired: number }> {
    const nowIso = now.toISOString();
    const expiredResult = await this.deps.uploads.listExpiredPending(nowIso, CLEANUP_LIMIT);
    if (!expiredResult.ok) return { expired: 0 };

    let expired = 0;
    for (const upload of expiredResult.value) {
      const marked = await this.deps.uploads.markExpired(upload.id);
      if (!marked.ok || !marked.value) continue;
      try {
        await this.deps.bucket.delete(upload.r2Key);
      } catch {
        continue;
      }
      expired += 1;
    }
    return { expired };
  }

  private async unchanged(
    uploadId: string,
    r2Key: string,
    name: string,
    version: number
  ): Promise<Result<FinishPublishResult>> {
    const marked = await this.deps.uploads.markUsedIfPending(uploadId);
    if (!marked.ok) return marked;
    if (!marked.value) return invalid(EXPIRED_MESSAGE);
    await this.deleteObject(r2Key);
    return ok({ status: "unchanged", name, version });
  }
  private async head(upload: UploadRow): Promise<Result<number | null>> {
    try {
      const object = await this.deps.bucket.head(upload.r2Key);
      return ok(object === null ? null : object.size);
    } catch {
      return upstream("zip を確かめられませんでした");
    }
  }
  private async inspect(upload: UploadRow): Promise<Result<InspectedSkill>> {
    const source = await r2RangeSource(this.deps.bucket, upload.r2Key);
    if (!source.ok) return source;
    return inspectSkillZip(source.value);
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.deps.bucket.delete(key);
    } catch {
      return;
    }
  }

  private buildStatements(input: {
    skillId: string;
    versionId: string;
    version: number;
    versionKey: string;
    createdAt: string;
    publishedBy: string;
    note: string | null;
    existing: { id: string } | null;
    skill: {
      name: string;
      title: string;
      description: string;
      fingerprint: string;
      fileCount: number;
      sizeBytes: number;
      files: { path: string; sizeBytes: number; isText: boolean; zipOffset: number }[];
    };
  }): BatchStatement[] {
    const { skill, existing } = input;
    const statements: BatchStatement[] = [];

    if (existing === null) {
      statements.push(
        this.deps.skills.insertStatement({
          id: input.skillId,
          name: skill.name,
          title: skill.title,
          description: skill.description,
          latestVersion: input.version,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        })
      );
    } else {
      statements.push(
        this.deps.skills.updateStatement(existing.id, {
          title: skill.title,
          description: skill.description,
          latestVersion: input.version,
          updatedAt: input.createdAt
        })
      );
    }

    statements.push(
      this.deps.versions.insertStatement({
        id: input.versionId,
        skillId: input.skillId,
        version: input.version,
        fingerprint: skill.fingerprint,
        sizeBytes: skill.sizeBytes,
        fileCount: skill.fileCount,
        note: input.note,
        publishedBy: input.publishedBy,
        r2Key: input.versionKey,
        createdAt: input.createdAt
      })
    );

    statements.push(
      ...this.deps.files.insertStatements(
        skill.files.map((file) => ({
          versionId: input.versionId,
          path: file.path,
          sizeBytes: file.sizeBytes,
          isText: file.isText,
          zipOffset: file.zipOffset
        }))
      )
    );

    return statements;
  }
}

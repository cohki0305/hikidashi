import { presignGet, type R2S3Config } from "@/server/lib/r2/presign";
import { notFound, ok, type Result, upstream } from "@/server/lib/result";
import { openEntryStream, r2RangeSource, readCentralDirectory } from "@/server/lib/zip";
import type { SkillFileRepository } from "@/server/repositories/skill-file-repository";
import type { SkillRepository, SkillRow } from "@/server/repositories/skill-repository";
import type {
  SkillVersionRepository,
  SkillVersionRow
} from "@/server/repositories/skill-version-repository";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";

/** プレビューで返すテキストの上限（256KB）。 */
export const PREVIEW_MAX_BYTES = 256 * 1024;

/** claude.ai にアップロードできる上限の既定値。issue #4 で実測して決める。 */
export const DEFAULT_CLAUDE_AI_MAX_BYTES = 30_000_000;

export type SkillServiceDeps = {
  skills: SkillRepository;
  versions: SkillVersionRepository;
  files: SkillFileRepository;
  bucket: R2Bucket;
  claudeAiMaxBytes?: number;
  s3?: R2S3Config;
};

async function readAll(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** 一覧・詳細・プレビュー・ダウンロードの業務ロジック。 */
export class SkillService {
  private readonly claudeAiMaxBytes: number;

  constructor(private readonly deps: SkillServiceDeps) {
    this.claudeAiMaxBytes = deps.claudeAiMaxBytes ?? DEFAULT_CLAUDE_AI_MAX_BYTES;
  }

  /** スキルを新しい順に返し、query があれば name・title・description で絞り込む。 */
  async list(query: string): Promise<Result<SkillSummary[]>> {
    const skillsResult = await this.deps.skills.list();
    if (!skillsResult.ok) return skillsResult;
    if (skillsResult.value.length === 0) return ok([]);

    const versionsResult = await this.deps.versions.listBySkillIds(
      skillsResult.value.map((skill) => skill.id)
    );
    if (!versionsResult.ok) return versionsResult;

    const normalized = query.trim().toLowerCase();
    const summaries: SkillSummary[] = [];
    for (const skill of skillsResult.value) {
      if (
        normalized !== "" &&
        ![skill.name, skill.title, skill.description].some((value) =>
          value.toLowerCase().includes(normalized)
        )
      )
        continue;
      const latest = versionsResult.value.find(
        (version) => version.skillId === skill.id && version.version === skill.latestVersion
      );
      if (latest === undefined) continue;
      summaries.push(this.toSummary(skill, latest));
    }
    return ok(summaries);
  }

  /** 最新版のファイルと、新しい順の版を返す。 */
  async show(name: string): Promise<Result<SkillDetailResponse>> {
    const skillResult = await this.deps.skills.findByName(name);
    if (!skillResult.ok) return skillResult;
    const skill = skillResult.value;
    if (skill === null) return notFound("スキルが見つかりません");

    const versionsResult = await this.deps.versions.listBySkillId(skill.id);
    if (!versionsResult.ok) return versionsResult;
    const versions = versionsResult.value;
    const latest =
      versions.find((version) => version.version === skill.latestVersion) ?? versions[0];
    if (latest === undefined) return notFound("スキルの版が見つかりません");

    const filesResult = await this.deps.files.listByVersionId(latest.id);
    if (!filesResult.ok) return filesResult;

    return ok({
      skill: this.toSummary(skill, latest),
      files: filesResult.value.map((file) => ({
        path: file.path,
        sizeBytes: file.sizeBytes,
        isText: file.isText
      })),
      versions: versions.map((version) => ({
        version: version.version,
        note: version.note,
        publishedBy: version.publishedBy,
        createdAt: version.createdAt,
        fingerprint: version.fingerprint,
        sizeBytes: version.sizeBytes,
        fileCount: version.fileCount
      }))
    });
  }

  /** 版のテキストファイルを、zip の範囲読み出しで返す。 */
  async preview(name: string, version: number, path: string): Promise<Result<string>> {
    const target = await this.resolveVersion(name, version);
    if (!target.ok) return target;
    const { version: versionRow } = target.value;

    const fileResult = await this.deps.files.findByVersionIdAndPath(versionRow.id, path);
    if (!fileResult.ok) return fileResult;
    const file = fileResult.value;
    if (file === null || !file.isText || file.sizeBytes > PREVIEW_MAX_BYTES)
      return notFound("プレビューできるファイルではありません");

    const sourceResult = await r2RangeSource(this.deps.bucket, versionRow.r2Key);
    if (!sourceResult.ok) return sourceResult;

    const entriesResult = await readCentralDirectory(sourceResult.value);
    if (!entriesResult.ok) return entriesResult;
    const entry = entriesResult.value.find(
      (candidate) => candidate.localHeaderOffset === file.zipOffset
    );
    if (entry === undefined || entry.path !== path || entry.isSymlink)
      return notFound("プレビューできるファイルではありません");
    // DB の size_bytes と zip の実体がずれていても、展開後の大きさで弾く（zip bomb 対策）。
    if (entry.uncompressedSize > PREVIEW_MAX_BYTES)
      return notFound("プレビューできるファイルではありません");

    const opened = await openEntryStream(sourceResult.value, entry);
    if (!opened.ok) return opened;

    try {
      const bytes = await readAll(opened.value, PREVIEW_MAX_BYTES);
      if (bytes === null) return notFound("プレビューできるファイルではありません");
      return ok(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    } catch {
      return upstream("ファイルの中身を読めませんでした");
    }
  }

  /** zip をそのまま流す。Worker のメモリに載せない。 */
  async download(
    name: string,
    version: number
  ): Promise<Result<{ body: ReadableStream; size: number; filename: string }>> {
    const target = await this.resolveVersion(name, version);
    if (!target.ok) return target;
    const { skill, version: versionRow } = target.value;

    try {
      const object = await this.deps.bucket.get(versionRow.r2Key);
      if (object === null || object.body === null) return notFound("zip が見つかりません");
      return ok({
        body: object.body,
        size: object.size,
        filename: `${skill.name}-v${versionRow.version}.zip`
      });
    } catch {
      return upstream("zip を読めませんでした");
    }
  }

  /** 指定の版（省略時は最新版）を入れるための、600 秒有効の署名付きダウンロード URL を返す。 */
  async installInfo(
    name: string,
    requestedVersion?: number
  ): Promise<
    Result<{
      name: string;
      version: number;
      fingerprint: string;
      sizeBytes: number;
      claudeCodeOnly: boolean;
      downloadUrl: string;
      expiresInSeconds: 600;
    }>
  > {
    const skillResult = await this.deps.skills.findByName(name);
    if (!skillResult.ok) return skillResult;
    const skill = skillResult.value;
    if (skill === null) return notFound("スキルが見つかりません");

    const versionResult = await this.deps.versions.findBySkillIdAndVersion(
      skill.id,
      requestedVersion ?? skill.latestVersion
    );
    if (!versionResult.ok) return versionResult;
    const version = versionResult.value;
    if (version === null) return notFound("スキルの版が見つかりません");

    const config = this.deps.s3;
    if (config === undefined)
      return upstream("R2 の S3 の設定が足りません", { missingConfig: true });

    let downloadUrl: string;
    try {
      downloadUrl = await presignGet(config, version.r2Key);
    } catch {
      return upstream("ダウンロード URL を作れませんでした");
    }

    return ok({
      name: skill.name,
      version: version.version,
      fingerprint: version.fingerprint,
      sizeBytes: version.sizeBytes,
      claudeCodeOnly: version.sizeBytes > this.claudeAiMaxBytes,
      downloadUrl,
      expiresInSeconds: 600
    });
  }

  private async resolveVersion(
    name: string,
    version: number
  ): Promise<Result<{ skill: SkillRow; version: SkillVersionRow }>> {
    const skillResult = await this.deps.skills.findByName(name);
    if (!skillResult.ok) return skillResult;
    const skill = skillResult.value;
    if (skill === null) return notFound("スキルが見つかりません");

    const versionResult = await this.deps.versions.findBySkillIdAndVersion(skill.id, version);
    if (!versionResult.ok) return versionResult;
    const versionRow = versionResult.value;
    if (versionRow === null) return notFound("スキルの版が見つかりません");

    return ok({ skill, version: versionRow });
  }

  private toSummary(skill: SkillRow, latest: SkillVersionRow): SkillSummary {
    return {
      name: skill.name,
      title: skill.title,
      description: skill.description,
      latestVersion: skill.latestVersion,
      updatedAt: skill.updatedAt,
      author: latest.publishedBy,
      sizeBytes: latest.sizeBytes,
      claudeCodeOnly: latest.sizeBytes > this.claudeAiMaxBytes
    };
  }
}

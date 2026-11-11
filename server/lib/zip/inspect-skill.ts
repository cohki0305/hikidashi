import { invalid, ok, type Result } from "@/server/lib/result";
import { parseSkillFrontmatter } from "@/server/lib/skills/frontmatter";
import { fingerprintOf } from "./fingerprint";
import { openEntryStream, type RangeSource, readCentralDirectory, type ZipEntry } from "./index";

/** 1 版の zip の上限（200 MB）。 */
const MAX_ZIP_BYTES = 209_715_200;
/** 1 版に入れられるファイル数。 */
const MAX_FILE_COUNT = 1_000;
/** 展開後の合計の上限（1 GB。zip 爆弾よけ）。 */
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1_073_741_824;
/** SKILL.md とプレビューに出すテキストの上限。 */
const MAX_TEXT_BYTES = 256 * 1024;

const LOCAL_HEADER_SIZE = 30;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ENCRYPTED_FLAGS = 0x0041;

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".ts",
  ".js",
  ".mjs",
  ".py",
  ".sh",
  ".html",
  ".css",
  ".xml",
  ".toml",
  ".ini",
  ".sql"
]);

/** 検査に通ったスキル。files の zipOffset は local header の位置。 */
export type InspectedSkill = {
  name: string;
  title: string;
  description: string;
  fingerprint: string;
  fileCount: number;
  sizeBytes: number;
  files: {
    path: string;
    sizeBytes: number;
    isText: boolean;
    zipOffset: number;
  }[];
};

type DigestStream = WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };
type DigestStreamConstructor = new (algorithm: string) => DigestStream;

function toHex(buffer: ArrayBuffer): string {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function digestStreamConstructor(): DigestStreamConstructor | undefined {
  return (crypto as unknown as { DigestStream?: DigestStreamConstructor }).DigestStream;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** `/` 区切りの相対パスだけを通す。空の区間・`.`・`..`・絶対パス・バックスラッシュは断る。 */
function isSafePath(path: string): boolean {
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** 手元の目印や OS の管理ファイルは公開しない。 */
function isIgnored(path: string): boolean {
  const segments = path.split("/");
  if (segments.includes("__MACOSX")) return true;
  const name = segments[segments.length - 1];
  return name === ".DS_Store" || name === ".hikidashi.json";
}

function isTextFile(path: string, sizeBytes: number): boolean {
  if (sizeBytes > MAX_TEXT_BYTES) return false;
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** local header の汎用フラグを読む。暗号化の判定に使う。 */
async function readGeneralPurposeFlags(
  source: RangeSource,
  entry: ZipEntry
): Promise<Result<number>> {
  if (entry.localHeaderOffset + LOCAL_HEADER_SIZE > source.size)
    return invalid("local header の位置が範囲外です");
  const header = await source.read(entry.localHeaderOffset, LOCAL_HEADER_SIZE);
  if (header.length < LOCAL_HEADER_SIZE) return invalid("local header を読み切れませんでした");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE)
    return invalid("local header の署名が不正です");
  return ok(view.getUint16(6, true));
}

type HashedEntry = {
  sha256: string;
  size: number;
  collected?: Uint8Array;
};

/**
 * 1 ファイルずつ展開しながら SHA-256 を取る。
 * 宣言サイズを超えた時点で読むのをやめ、zip 爆弾でメモリを使い切らないようにする。
 */
async function hashEntry(
  stream: ReadableStream<Uint8Array>,
  declaredSize: number,
  maxTotalBytes: number,
  collect: boolean
): Promise<Result<HashedEntry>> {
  const DigestStreamImpl = digestStreamConstructor();
  const digestStream = DigestStreamImpl ? new DigestStreamImpl("SHA-256") : undefined;
  const writer = digestStream?.getWriter();
  const fallbackChunks: Uint8Array[] = [];
  const collectedChunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let size = 0;
  let failure: Result<HashedEntry> | null = null;

  const stop = async (): Promise<void> => {
    await reader.cancel().catch(() => {});
    if (writer) await writer.abort().catch(() => {});
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.length === 0) continue;

      size += value.length;
      if (size > declaredSize) {
        failure = invalid("展開後のサイズが宣言と一致しません");
        break;
      }
      if (size > maxTotalBytes) {
        failure = invalid("展開後の合計が大きすぎます");
        break;
      }

      if (writer) await writer.write(value);
      else fallbackChunks.push(value);
      if (collect) collectedChunks.push(value.slice());
    }
  } catch {
    failure = invalid("zip のエントリを展開できませんでした");
  }

  if (failure) {
    await stop();
    return failure;
  }
  if (size !== declaredSize) {
    await stop();
    return invalid("展開後のサイズが宣言と一致しません");
  }

  let digest: ArrayBuffer;
  try {
    if (digestStream && writer) {
      await writer.close();
      digest = await digestStream.digest;
    } else {
      digest = await crypto.subtle.digest("SHA-256", concat(fallbackChunks));
    }
  } catch {
    return invalid("zip のエントリを展開できませんでした");
  }

  return ok({
    sha256: toHex(digest),
    size,
    collected: collect ? concat(collectedChunks) : undefined
  });
}

type NormalizedEntry = { path: string; entry: ZipEntry };

/** 直下、または唯一のトップフォルダの直下に SKILL.md がある形にそろえる。 */
function normalizePaths(entries: readonly ZipEntry[]): Result<NormalizedEntry[]> {
  if (entries.some((entry) => entry.path === "SKILL.md")) {
    return ok(entries.map((entry) => ({ path: entry.path, entry })));
  }

  const topFolders = new Set(entries.map((entry) => entry.path.split("/")[0]));
  if (topFolders.size !== 1) return invalid("zip の一番上に SKILL.md がありません");

  const [top] = [...topFolders];
  if (top === undefined || entries.some((entry) => !entry.path.startsWith(`${top}/`)))
    return invalid("zip の一番上に SKILL.md がありません");

  const stripped = entries.map((entry) => ({
    path: entry.path.slice(top.length + 1),
    entry
  }));
  if (!stripped.some((entry) => entry.path === "SKILL.md"))
    return invalid("zip の一番上に SKILL.md がありません");
  return ok(stripped);
}

/** zip を 1 ファイルずつ読んで検査する。zip 全体をメモリに載せない。 */
export async function inspectSkillZip(source: RangeSource): Promise<Result<InspectedSkill>> {
  try {
    if (source.size > MAX_ZIP_BYTES) return invalid("zip が大きすぎます");

    const central = await readCentralDirectory(source);
    if (!central.ok) return central;

    const entries: ZipEntry[] = [];
    for (const entry of central.value) {
      if (!isSafePath(entry.path)) return invalid("zip の中に安全でないパスがあります");
      if (entry.isSymlink) return invalid("シンボリックリンクは公開できません");
      if (isIgnored(entry.path)) continue;
      entries.push(entry);
    }

    if (entries.length > MAX_FILE_COUNT) return invalid("ファイルが多すぎます（1,000 個まで）");

    const normalized = normalizePaths(entries);
    if (!normalized.ok) return normalized;

    const skillMd = normalized.value.find((item) => item.path === "SKILL.md");
    if (!skillMd || skillMd.entry.uncompressedSize > MAX_TEXT_BYTES)
      return invalid("SKILL.md が大きすぎます");

    const declaredTotal = normalized.value.reduce(
      (total, item) => total + item.entry.uncompressedSize,
      0
    );
    if (declaredTotal > MAX_TOTAL_UNCOMPRESSED_BYTES) return invalid("展開後の合計が大きすぎます");

    const files: InspectedSkill["files"] = [];
    const fingerprints: { path: string; sha256: string }[] = [];
    let total = 0;
    let skillMdBytes: Uint8Array | undefined;

    for (const item of normalized.value) {
      const flags = await readGeneralPurposeFlags(source, item.entry);
      if (!flags.ok) return flags;
      if ((flags.value & ENCRYPTED_FLAGS) !== 0)
        return invalid("暗号化された zip には対応していません");

      const opened = await openEntryStream(source, item.entry);
      if (!opened.ok) return opened;

      const hashed = await hashEntry(
        opened.value,
        item.entry.uncompressedSize,
        MAX_TOTAL_UNCOMPRESSED_BYTES - total,
        item.path === "SKILL.md"
      );
      if (!hashed.ok) return hashed;
      total += hashed.value.size;

      if (item.path === "SKILL.md") skillMdBytes = hashed.value.collected;
      fingerprints.push({ path: item.path, sha256: hashed.value.sha256 });
      files.push({
        path: item.path,
        sizeBytes: item.entry.uncompressedSize,
        isText: isTextFile(item.path, item.entry.uncompressedSize),
        zipOffset: item.entry.localHeaderOffset
      });
    }

    if (skillMdBytes === undefined) return invalid("zip の一番上に SKILL.md がありません");
    const frontmatter = parseSkillFrontmatter(new TextDecoder("utf-8").decode(skillMdBytes));
    if (!frontmatter.ok) return frontmatter;

    return ok({
      name: frontmatter.value.name,
      title: frontmatter.value.title,
      description: frontmatter.value.description,
      fingerprint: await fingerprintOf(fingerprints),
      fileCount: files.length,
      sizeBytes: source.size,
      files
    });
  } catch {
    return invalid("zip を検査できませんでした");
  }
}

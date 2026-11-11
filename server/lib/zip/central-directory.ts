import { invalid, ok, type Result } from "@/server/lib/result";

/** zip の範囲読み出し口。R2 でもテストのメモリでも同じ形で扱う。 */
export type RangeSource = {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  stream(offset: number, length: number): Promise<ReadableStream<Uint8Array>>;
};

/** 中央ディレクトリが持つファイル 1 つ分の情報。 */
export type ZipEntry = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  method: 0 | 8;
  localHeaderOffset: number;
  isSymlink: boolean;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_SEARCH_SIZE = 0xffff + EOCD_MIN_SIZE;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const UNIX_SYMLINK_MODE = 0o120000;
const UNIX_FILE_TYPE_MASK = 0o170000;

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function isZip64Marker(value: number): boolean {
  return value === 0xffff || value === 0xffffffff;
}

/** 末尾から EOCD を探す。コメント長も確かめ、途中の署名の偶然一致をはじく。 */
function findEocd(tail: Uint8Array): number {
  for (let index = tail.length - EOCD_MIN_SIZE; index >= 0; index--) {
    if (u32(tail, index) !== EOCD_SIGNATURE) continue;
    const commentLength = u16(tail, index + 20);
    if (index + EOCD_MIN_SIZE + commentLength === tail.length) return index;
  }
  return -1;
}

/** ZIP64 は 200MB・1,000 ファイルの上限では要らないので、目印があれば読まない。 */
function hasZip64Marker(eocd: Uint8Array, index: number): boolean {
  if (index >= 20 && u32(eocd, index - 20) === ZIP64_EOCD_LOCATOR_SIGNATURE) return true;
  return (
    u16(eocd, index + 4) === 0xffff ||
    u16(eocd, index + 6) === 0xffff ||
    u16(eocd, index + 8) === 0xffff ||
    u16(eocd, index + 10) === 0xffff ||
    u32(eocd, index + 12) === 0xffffffff ||
    u32(eocd, index + 16) === 0xffffffff
  );
}

/** 中央ディレクトリの extra field に ZIP64 の目印（ID 0x0001）が無いか確かめる。 */
function hasZip64Extra(bytes: Uint8Array, start: number, length: number): boolean {
  const end = start + length;
  let offset = start;
  while (offset + 4 <= end) {
    const id = u16(bytes, offset);
    const size = u16(bytes, offset + 2);
    offset += 4;
    if (offset + size > end) return false;
    if (id === 0x0001) return true;
    offset += size;
  }
  return false;
}

function decodePath(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function isSymlink(externalAttributes: number): boolean {
  return ((externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK_MODE;
}

function parseCentralDirectory(bytes: Uint8Array, entryCount: number): Result<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let index = 0; index < entryCount; index++) {
    if (offset + CENTRAL_DIRECTORY_HEADER_SIZE > bytes.length)
      return invalid("中央ディレクトリが途中で終わっています");
    if (u32(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE)
      return invalid("中央ディレクトリの署名が不正です");

    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const uncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const diskStart = u16(bytes, offset + 34);
    const externalAttributes = u32(bytes, offset + 38);
    const localHeaderOffset = u32(bytes, offset + 42);
    const headerEnd = offset + CENTRAL_DIRECTORY_HEADER_SIZE;
    const entryEnd = headerEnd + nameLength + extraLength + commentLength;
    if (entryEnd > bytes.length) return invalid("中央ディレクトリが途中で終わっています");

    if (
      isZip64Marker(compressedSize) ||
      isZip64Marker(uncompressedSize) ||
      isZip64Marker(localHeaderOffset) ||
      isZip64Marker(diskStart)
    )
      return invalid("ZIP64 には対応していません");
    if (method !== 0 && method !== 8) return invalid("対応していない圧縮方式です");

    if (hasZip64Extra(bytes, headerEnd + nameLength, extraLength))
      return invalid("ZIP64 には対応していません");

    const path = decodePath(bytes.subarray(headerEnd, headerEnd + nameLength));
    offset = entryEnd;
    if (path.length === 0) return invalid("ファイル名が空のエントリがあります");
    if (path.endsWith("/")) continue;

    entries.push({
      path,
      compressedSize,
      uncompressedSize,
      method,
      localHeaderOffset,
      isSymlink: isSymlink(externalAttributes)
    });
  }
  return ok(entries);
}

/** zip の末尾から中央ディレクトリを読み、ファイル一覧を返す。 */
export async function readCentralDirectory(source: RangeSource): Promise<Result<ZipEntry[]>> {
  try {
    if (source.size < EOCD_MIN_SIZE) return invalid("zip が小さすぎます");

    const searchLength = Math.min(source.size, EOCD_MAX_SEARCH_SIZE);
    const tail = await source.read(source.size - searchLength, searchLength);
    if (tail.length < EOCD_MIN_SIZE) return invalid("zip の終端が見つかりません");

    const eocdIndex = findEocd(tail);
    if (eocdIndex < 0) return invalid("zip の終端（EOCD）が見つかりません");
    if (hasZip64Marker(tail, eocdIndex)) return invalid("ZIP64 には対応していません");

    const diskNumber = u16(tail, eocdIndex + 4);
    const centralDirectoryDisk = u16(tail, eocdIndex + 6);
    const entriesOnDisk = u16(tail, eocdIndex + 8);
    const entryCount = u16(tail, eocdIndex + 10);
    const centralDirectorySize = u32(tail, eocdIndex + 12);
    const centralDirectoryOffset = u32(tail, eocdIndex + 16);

    if (diskNumber !== 0 || centralDirectoryDisk !== 0)
      return invalid("分割された zip には対応していません");
    if (entriesOnDisk !== entryCount) return invalid("中央ディレクトリの件数が一致しません");
    if (
      centralDirectoryOffset + centralDirectorySize > source.size ||
      centralDirectoryOffset > source.size
    )
      return invalid("中央ディレクトリの位置が範囲外です");

    const centralDirectory = await source.read(centralDirectoryOffset, centralDirectorySize);
    if (centralDirectory.length < centralDirectorySize)
      return invalid("中央ディレクトリを読み切れませんでした");

    return parseCentralDirectory(centralDirectory, entryCount);
  } catch {
    return invalid("zip の中央ディレクトリを読めませんでした");
  }
}

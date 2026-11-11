import { invalid, ok, type Result } from "@/server/lib/result";
import type { RangeSource, ZipEntry } from "./central-directory";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const LOCAL_HEADER_SIZE = 30;

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

/** エントリの local header を読み、データ部分を範囲読み出しの stream で返す。 */
export async function openEntryStream(
  source: RangeSource,
  entry: ZipEntry
): Promise<Result<ReadableStream<Uint8Array>>> {
  try {
    if (entry.localHeaderOffset + LOCAL_HEADER_SIZE > source.size)
      return invalid("local header の位置が範囲外です");

    const header = await source.read(entry.localHeaderOffset, LOCAL_HEADER_SIZE);
    if (header.length < LOCAL_HEADER_SIZE) return invalid("local header を読み切れませんでした");
    if (u32(header, 0) !== LOCAL_HEADER_SIGNATURE) return invalid("local header の署名が不正です");

    const method = u16(header, 8);
    if (method !== 0 && method !== 8) return invalid("対応していない圧縮方式です");
    if (method !== entry.method) return invalid("中央ディレクトリと圧縮方式が一致しません");

    const nameLength = u16(header, 26);
    const extraLength = u16(header, 28);
    const dataOffset = entry.localHeaderOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
    if (dataOffset + entry.compressedSize > source.size)
      return invalid("ファイルのデータが範囲外です");

    const raw = await source.stream(dataOffset, entry.compressedSize);
    if (entry.method === 8) {
      // DecompressionStream の writable は BufferSource を受ける型なので、pipeThrough の型に合わせる。
      const decompressor = new DecompressionStream(
        "deflate-raw"
      ) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
      return ok(raw.pipeThrough(decompressor));
    }
    return ok(raw);
  } catch {
    return invalid("zip のエントリを読めませんでした");
  }
}

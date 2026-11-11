const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const EOCD_MIN_SIZE = 22;

export type CentralEntryLocation = {
  path: string;
  /** 中央ディレクトリ内のヘッダーの位置。 */
  offset: number;
  /** local header の位置。 */
  localHeaderOffset: number;
};

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function eocdOffset(bytes: Uint8Array): number {
  const view = viewOf(bytes);
  for (let index = bytes.length - EOCD_MIN_SIZE; index >= 0; index--) {
    if (view.getUint32(index, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(index + 20, true);
    if (index + EOCD_MIN_SIZE + commentLength === bytes.length) return index;
  }
  throw new Error("EOCD が見つかりません");
}

/** テストで作った zip の中央ディレクトリを、パスと位置だけ取り出す。 */
export function centralEntriesOf(bytes: Uint8Array): CentralEntryLocation[] {
  const view = viewOf(bytes);
  const eocd = eocdOffset(bytes);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: CentralEntryLocation[] = [];

  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE)
      throw new Error("中央ディレクトリの署名が不正です");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({
      path,
      offset,
      localHeaderOffset: view.getUint32(offset + 42, true)
    });
    offset += CENTRAL_DIRECTORY_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryOf(bytes: Uint8Array, path: string): CentralEntryLocation {
  const entry = centralEntriesOf(bytes).find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`エントリがありません: ${path}`);
  return entry;
}

/** 中央ディレクトリの展開後サイズを書き換える（zip 爆弾の検査用）。 */
export function setCentralUncompressedSize(bytes: Uint8Array, path: string, size: number): void {
  const view = viewOf(bytes);
  view.setUint32(entryOf(bytes, path).offset + 24, size, true);
}

/** 中央ディレクトリの圧縮方式を書き換える（非対応方式の検査用）。 */
export function setCentralMethod(bytes: Uint8Array, path: string, method: number): void {
  const view = viewOf(bytes);
  view.setUint16(entryOf(bytes, path).offset + 10, method, true);
}

/** local header と中央ディレクトリの暗号化フラグを立てる。 */
export function setEncryptedFlag(bytes: Uint8Array, path: string): void {
  const view = viewOf(bytes);
  const entry = entryOf(bytes, path);
  view.setUint16(entry.offset + 8, view.getUint16(entry.offset + 8, true) | 1, true);
  view.setUint16(
    entry.localHeaderOffset + 6,
    view.getUint16(entry.localHeaderOffset + 6, true) | 1,
    true
  );
}

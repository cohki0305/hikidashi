import { type ZipOptions, type Zippable, zipSync } from "fflate";

export type MakeZipEntry = {
  path: string;
  data: string | Uint8Array;
  /** true なら無圧縮（method 0）で入れる。 */
  store?: boolean;
  /** true なら Unix のシンボリックリンクとして外部属性を付ける。 */
  symlink?: boolean;
};

export type MakeZipOptions = {
  /** zip 全体のコメント。EOCD の探索範囲を確かめるテストで使う。 */
  comment?: string;
};

/** テスト用の小さな zip をメモリ上で作る。 */
export function makeZip(
  entries: readonly MakeZipEntry[],
  options: MakeZipOptions = {}
): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) {
    const data = typeof entry.data === "string" ? new TextEncoder().encode(entry.data) : entry.data;
    const fileOptions: ZipOptions = {};
    if (entry.store) fileOptions.level = 0;
    if (entry.symlink) {
      fileOptions.os = 3;
      fileOptions.attrs = 0o120777 << 16;
    }
    files[entry.path] = [data, fileOptions];
  }
  return zipSync(files, options.comment === undefined ? {} : { comment: options.comment });
}

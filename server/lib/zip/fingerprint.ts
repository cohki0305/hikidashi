export type FingerprintEntry = { path: string; sha256: string };

function toHex(buffer: ArrayBuffer): string {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * スキルの指紋。パスで並べた (path, sha256) の一覧を SHA-256 にする。
 * 圧縮方式や zip 内の順番が変わっても、同じ中身なら同じ値になる。
 */
export async function fingerprintOf(entries: readonly FingerprintEntry[]): Promise<string> {
  const lines = [...entries]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) => `${entry.path}\t${entry.sha256}\n`)
    .join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines));
  return toHex(digest);
}

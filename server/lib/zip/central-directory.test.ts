import { describe, expect, test } from "bun:test";
import { makeZip } from "@/tests/helpers/make-zip";
import { type RangeSource, readCentralDirectory, type ZipEntry } from "./central-directory";

function sourceOf(bytes: Uint8Array): RangeSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.slice(offset, Math.min(bytes.length, offset + length)),
    stream: async (offset, length) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(offset, Math.min(bytes.length, offset + length)));
          controller.close();
        }
      })
  };
}

function entryByPath(entries: readonly ZipEntry[], path: string): ZipEntry {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`エントリがありません: ${path}`);
  return entry;
}

const FILES = [
  { path: "SKILL.md", data: "# 見本のスキル\n" },
  { path: "scripts/run.md", data: "手順を書いたファイル\n" },
  { path: "assets/logo.bin", data: new Uint8Array([0, 1, 2, 3, 254, 255]), store: true }
] as const;

describe("readCentralDirectory", () => {
  test("3 ファイルの一覧とサイズを読む", async () => {
    const result = await readCentralDirectory(sourceOf(makeZip(FILES)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.map((entry) => entry.path)).toEqual(FILES.map((file) => file.path));
    const encoder = new TextEncoder();
    for (const file of FILES) {
      const entry = entryByPath(result.value, file.path);
      const size =
        typeof file.data === "string" ? encoder.encode(file.data).length : file.data.length;
      expect(entry.uncompressedSize).toBe(size);
      expect(entry.isSymlink).toBe(false);
    }
    const offsets = result.value.map((entry) => entry.localHeaderOffset);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(new Set(offsets).size).toBe(FILES.length);
    expect(entryByPath(result.value, "SKILL.md").method).toBe(8);
    expect(entryByPath(result.value, "assets/logo.bin").method).toBe(0);
    expect(entryByPath(result.value, "assets/logo.bin").compressedSize).toBe(6);
  });

  test("末尾を 10 バイト削った zip は invalid", async () => {
    const broken = makeZip(FILES).slice(0, -10);

    const result = await readCentralDirectory(sourceOf(broken));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("長いコメントが付いていても EOCD を探して読める", async () => {
    const zip = makeZip(FILES, { comment: "a".repeat(60_000) });

    const result = await readCentralDirectory(sourceOf(zip));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });

  test("シンボリックリンクは isSymlink が true", async () => {
    const zip = makeZip([{ path: "link.md", data: "SKILL.md", symlink: true, store: true }]);

    const result = await readCentralDirectory(sourceOf(zip));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(entryByPath(result.value, "link.md").isSymlink).toBe(true);
  });

  test("ZIP64 の目印があれば invalid", async () => {
    const zip = makeZip(FILES);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    view.setUint16(zip.length - 22 + 10, 0xffff, true);

    const result = await readCentralDirectory(sourceOf(zip));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });
});

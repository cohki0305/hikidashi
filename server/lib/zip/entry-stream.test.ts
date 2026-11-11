import { describe, expect, test } from "bun:test";
import { makeZip } from "@/tests/helpers/make-zip";
import { type RangeSource, readCentralDirectory, type ZipEntry } from "./central-directory";
import { openEntryStream } from "./entry-stream";

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

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function entriesOf(zip: Uint8Array): Promise<ZipEntry[]> {
  const result = await readCentralDirectory(sourceOf(zip));
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const FILES = [
  { path: "SKILL.md", data: "# 見本のスキル\n" },
  { path: "scripts/run.md", data: "手順を書いたファイル\n" },
  { path: "assets/logo.bin", data: new Uint8Array([0, 1, 2, 3, 254, 255]), store: true }
] as const;

describe("openEntryStream", () => {
  test("各エントリの中身が元のデータと一致する", async () => {
    const zip = makeZip(FILES);
    const entries = await entriesOf(zip);
    const encoder = new TextEncoder();

    for (const file of FILES) {
      const entry = entries.find((candidate) => candidate.path === file.path);
      if (!entry) throw new Error(`エントリがありません: ${file.path}`);
      const opened = await openEntryStream(sourceOf(zip), entry);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const expected =
        typeof file.data === "string" ? encoder.encode(file.data) : new Uint8Array(file.data);
      expect(await readAll(opened.value)).toEqual(expected);
    }
  });

  test("local header の署名が壊れていたら invalid", async () => {
    const zip = makeZip(FILES);
    const entry = (await entriesOf(zip))[0];
    if (!entry) throw new Error("エントリがありません");
    const broken = zip.slice();
    new DataView(broken.buffer, broken.byteOffset, broken.byteLength).setUint32(
      entry.localHeaderOffset,
      0
    );

    const result = await openEntryStream(sourceOf(broken), entry);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("local header の位置が範囲外なら invalid", async () => {
    const zip = makeZip(FILES);
    const entry = (await entriesOf(zip))[0];
    if (!entry) throw new Error("エントリがありません");

    const result = await openEntryStream(sourceOf(zip), {
      ...entry,
      localHeaderOffset: zip.length
    });

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });
});

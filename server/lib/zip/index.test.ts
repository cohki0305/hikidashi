import { describe, expect, test } from "bun:test";
import { openEntryStream, r2RangeSource, readCentralDirectory } from "./index";

const KEY = "versions/skill-1/1.zip";
const BYTES = new Uint8Array([0, 1, 2, 3, 4, 5]);

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

function fakeBucket(bytes: Uint8Array): R2Bucket {
  return {
    head: async (key: string) => (key === KEY ? { size: bytes.length } : null),
    get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
      if (key !== KEY) return null;
      const range = options?.range;
      const data = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return {
        body: streamOf(data),
        arrayBuffer: async () => data.buffer
      };
    }
  } as unknown as R2Bucket;
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

describe("r2RangeSource", () => {
  test("サイズと指定した範囲だけを読む", async () => {
    const result = await r2RangeSource(fakeBucket(BYTES), KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.size).toBe(BYTES.length);
    expect(await result.value.read(2, 3)).toEqual(new Uint8Array([2, 3, 4]));
    expect(await readAll(await result.value.stream(1, 2))).toEqual(new Uint8Array([1, 2]));
  });

  test("長さ 0 の読み出しは空を返す", async () => {
    const result = await r2RangeSource(fakeBucket(BYTES), KEY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.value.read(3, 0)).toEqual(new Uint8Array());
    expect(await readAll(await result.value.stream(3, 0))).toEqual(new Uint8Array());
  });

  test("無いキーは notFound", async () => {
    const result = await r2RangeSource(fakeBucket(BYTES), "versions/skill-1/2.zip");

    expect(result).toMatchObject({ ok: false, kind: "not_found" });
  });

  test("読み取り部品をまとめて公開する", () => {
    expect(typeof readCentralDirectory).toBe("function");
    expect(typeof openEntryStream).toBe("function");
  });
});

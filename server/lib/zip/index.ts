import { notFound, ok, type Result, upstream } from "@/server/lib/result";
import type { RangeSource } from "./central-directory";

export * from "./central-directory";
export * from "./entry-stream";

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    }
  });
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

/** R2 の zip を、必要な範囲だけ読む RangeSource にする。 */
export async function r2RangeSource(bucket: R2Bucket, key: string): Promise<Result<RangeSource>> {
  try {
    const head = await bucket.head(key);
    if (head === null) return notFound("zip が見つかりません");

    return ok({
      size: head.size,
      read: async (offset, length) => {
        if (length <= 0) return new Uint8Array();
        const object = await bucket.get(key, { range: { offset, length } });
        if (object === null || object.body === null) return new Uint8Array();
        return readAll(object.body);
      },
      stream: async (offset, length) => {
        if (length <= 0) return emptyStream();
        const object = await bucket.get(key, { range: { offset, length } });
        if (object === null || object.body === null) return emptyStream();
        return object.body;
      }
    });
  } catch {
    return upstream("R2 の zip を読めませんでした");
  }
}

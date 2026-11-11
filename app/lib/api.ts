import type { z } from "zod";
import type { Err, Result } from "@/server/lib/result";

// app から server の値は import できないので、失敗の値は型に合わせてここで作る。
function failure(kind: Err["kind"], message: string): Err {
  return { ok: false, kind, message };
}

let defaultFetch: typeof fetch | null = null;

/** 既定の fetch を差し替える。開発用の偽の応答とテストが使う。null で元に戻す。 */
export function setDefaultFetch(impl: typeof fetch | null): void {
  defaultFetch = impl;
}

/** GET で JSON を受け取り、スキーマで検査して Result にする。例外は投げない。 */
export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fetchImpl?: typeof fetch
): Promise<Result<T>> {
  const doFetch = fetchImpl ?? defaultFetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(path, { headers: { accept: "application/json" } });
  } catch {
    return failure("upstream", "通信に失敗しました");
  }
  if (response.status === 404) return failure("not_found", "見つかりませんでした");
  if (!response.ok) return failure("upstream", "読み込みに失敗しました");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure("upstream", "応答を読み取れませんでした");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return failure("upstream", "応答の形が想定と違います");
  return { ok: true, value: parsed.data };
}

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

type SendOptions = {
  /** 送る本文。省略すると本文なしで送る。 */
  body?: unknown;
  fetchImpl?: typeof fetch;
};

/** POST・DELETE などで送り、応答を Result にする。例外は投げない。 */
export async function sendRequest(
  method: "POST" | "DELETE" | "PUT" | "PATCH",
  path: string,
  options: SendOptions = {}
): Promise<Result<Response>> {
  const doFetch = options.fetchImpl ?? defaultFetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/json" };
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await doFetch(path, init);
  } catch {
    return failure("upstream", "通信に失敗しました");
  }
  if (response.ok) return { ok: true, value: response };
  if (response.status === 404) return failure("not_found", "見つかりませんでした");
  if (response.status === 403) return failure("forbidden", "許可がありません");
  if (response.status >= 500) return failure("upstream", "送信に失敗しました");
  return failure("invalid", "送信できませんでした");
}

/** POST で JSON を送り、応答をスキーマで検査して Result にする。例外は投げない。 */
export async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  fetchImpl?: typeof fetch
): Promise<Result<T>> {
  const sent = await sendRequest("POST", path, { body, fetchImpl });
  if (!sent.ok) return sent;
  let parsed: unknown;
  try {
    parsed = await sent.value.json();
  } catch {
    return failure("upstream", "応答を読み取れませんでした");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) return failure("upstream", "応答の形が想定と違います");
  return { ok: true, value: result.data };
}

/** GET でテキストを受け取り Result にする。例外は投げない。 */
export async function getText(path: string, fetchImpl?: typeof fetch): Promise<Result<string>> {
  const doFetch = fetchImpl ?? defaultFetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(path, { headers: { accept: "text/plain" } });
  } catch {
    return failure("upstream", "通信に失敗しました");
  }
  if (response.status === 404) return failure("not_found", "見つかりませんでした");
  if (!response.ok) return failure("upstream", "読み込みに失敗しました");
  try {
    return { ok: true, value: await response.text() };
  } catch {
    return failure("upstream", "応答を読み取れませんでした");
  }
}

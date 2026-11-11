import type { Context } from "hono";
import type { Err, FailureKind } from "./result";

export const FAILURE_STATUS = {
  not_found: 404,
  invalid: 400,
  conflict: 409,
  forbidden: 403,
  rate_limited: 429,
  upstream: 502
} as const satisfies Record<FailureKind, 400 | 403 | 404 | 409 | 429 | 502>;

export function ok<T>(c: Context, body: T) {
  return c.json(body, 200);
}

/** text/plain の応答。 */
export function text(c: Context, body: string) {
  return c.body(body, 200, { "Content-Type": "text/plain; charset=utf-8" });
}

/** stream をそのまま流す応答。ヘッダーは呼び出し側が決める。 */
export function stream(c: Context, body: ReadableStream, headers: Record<string, string>) {
  return c.body(body, 200, headers);
}

/** 一時 URL など別の場所へ 302 で渡す。 */
export function redirect(c: Context, location: string) {
  return c.redirect(location, 302);
}

/** 設定が欠けていて処理を提供できないときの応答。fail closed に使う。 */
export function unavailable(c: Context, message: string) {
  return c.json({ error: message, kind: "upstream", details: null }, 503);
}

export function failure(c: Context, err: Err) {
  return c.json(
    {
      error: err.message,
      kind: err.kind,
      details: err.details ?? null
    },
    FAILURE_STATUS[err.kind]
  );
}

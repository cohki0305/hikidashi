/** API の失敗の種類。HTTP の status への対応は server/lib/http.ts が持つ。 */
export type FailureKind =
  | "not_found"
  | "invalid"
  | "conflict"
  | "forbidden"
  | "rate_limited"
  | "upstream";

export type Ok<T> = { ok: true; value: T };
export type Err = {
  ok: false;
  kind: FailureKind;
  message: string;
  details?: Record<string, unknown>;
};
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function fail(kind: FailureKind, message: string, details?: Record<string, unknown>): Err {
  return details ? { ok: false, kind, message, details } : { ok: false, kind, message };
}

export function notFound(message: string, details?: Record<string, unknown>): Err {
  return fail("not_found", message, details);
}

export function invalid(message: string, details?: Record<string, unknown>): Err {
  return fail("invalid", message, details);
}

export function conflict(message: string, details?: Record<string, unknown>): Err {
  return fail("conflict", message, details);
}

export function forbidden(message: string, details?: Record<string, unknown>): Err {
  return fail("forbidden", message, details);
}

export function rateLimited(message: string, details?: Record<string, unknown>): Err {
  return fail("rate_limited", message, details);
}

export function upstream(message: string, details?: Record<string, unknown>): Err {
  return fail("upstream", message, details);
}

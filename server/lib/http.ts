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

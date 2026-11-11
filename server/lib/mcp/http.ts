import type { Context } from "hono";

/** 通知（id のない JSON-RPC）への応答。本文は付けない。 */
export function acceptedWithoutBody(c: Context) {
  return c.body(null, 202);
}

/** 開いていない入口には、許すメソッドだけを伝えて 405 を返す。 */
export function methodNotAllowed(c: Context, allow: string) {
  c.header("Allow", allow);
  return c.body(null, 405);
}

/** トークンを確かめられない呼び出しへの応答。 */
export function unauthorized(c: Context) {
  return c.json({ error: "Unauthorized" }, 401);
}

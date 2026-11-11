import type { Context } from "hono";

/** RFC 6749 のエラー応答。トークンを扱う応答は保存させない。 */
export function oauthError(c: Context, status: 400 | 429, error: string, description?: string) {
  c.header("Cache-Control", "no-store");
  return c.json(description ? { error, error_description: description } : { error }, status);
}

export function plainText(c: Context, status: 400, text: string) {
  return c.text(text, status);
}

export function redirectTo(c: Context, location: string) {
  return c.redirect(location, 302);
}

/** 値が文字列のものだけ取り、ほかは undefined にする（ファイル・配列は受けない）。 */
export function stringFields<K extends string>(
  source: Record<string, unknown>,
  keys: readonly K[]
): Record<K, string | undefined> {
  return Object.fromEntries(
    keys.map((key) => [key, typeof source[key] === "string" ? source[key] : undefined])
  ) as Record<K, string | undefined>;
}

/**
 * 登録の本文（RFC 7591）から名前と戻り先を取り出す。文字列でない戻り先は空にして、
 * 検証で弾かれるようにする（黙って捨てない）。オブジェクトでなければ null。
 */
export function parseRegistration(
  body: unknown
): { clientName: string | undefined; redirectUris: string[] } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { client_name: name, redirect_uris: uris } = body as Record<string, unknown>;
  return {
    clientName: typeof name === "string" ? name : undefined,
    redirectUris: Array.isArray(uris) ? uris.map((uri) => (typeof uri === "string" ? uri : "")) : []
  };
}

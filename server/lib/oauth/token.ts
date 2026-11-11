const PREFIX = { access: "hkd_at_", refresh: "hkd_rt_", code: "hkd_cd_" } as const;

export type TokenKind = keyof typeof PREFIX;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashBytes(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const randomBase64Url = (bytes: number) =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

/** 種類の接頭辞 + 32 バイトの base64url。平文は応答にだけ載せ、保存は hashToken の値にする。 */
export const generateToken = (kind: TokenKind): string => `${PREFIX[kind]}${randomBase64Url(32)}`;

/** ランダム 32 字（24 バイトの base64url）。 */
export const generateClientId = (): string => randomBase64Url(24);

/** 保存する値。sha256 の hex（64 字）。 */
export async function hashToken(token: string): Promise<string> {
  return [...(await hashBytes(token))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

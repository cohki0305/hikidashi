import { hashBytes, toBase64Url } from "./token";

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

/** S256 の code_challenge（sha256 の base64url、パディングなしの 43 字）の形か。 */
export const isCodeChallenge = (value: string): boolean => CHALLENGE_RE.test(value);

// 長さが違えば false。一致の判定は先頭の差で早く返さない
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyS256(verifier: string, challenge: string): Promise<boolean> {
  if (!VERIFIER_RE.test(verifier)) return false;
  const computed = toBase64Url(await hashBytes(verifier));
  return sameText(computed, challenge);
}

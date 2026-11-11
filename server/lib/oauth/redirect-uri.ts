const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** 戻り先に登録できるのは https か、localhost・127.0.0.1 の http（ポート任意）だけ。 */
export function isAllowedRedirectUri(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.hash !== "" || url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/** 戻り先に値を足す（null は足さない）。戻り先自身のクエリは残す。 */
export function redirectWith(base: string, params: Record<string, string | null>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params))
    if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

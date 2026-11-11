/** 認可サーバーの issuer。APP_URL の末尾の / を落とした値で、案内と戻り先の iss の両方に使う。 */
export function issuerOf(appUrl: string): string {
  return appUrl.replace(/\/+$/, "");
}

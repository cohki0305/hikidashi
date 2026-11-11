/** 配る元のファイルを取る口（Workers の ASSETS 束縛と同じ形）。 */
type Assets = { fetch: (request: Request) => Promise<Response> };

// Hono のアプリ（bootstrap）に渡す道。wrangler.jsonc の run_worker_first で先に Worker を通す。
const APP_EXACT: ReadonlySet<string> = new Set(["/api"]);
const APP_PREFIXES = ["/api/", "/oauth/", "/.well-known/"] as const;

/** Hono のアプリが受ける道か（それ以外は画面かファイル） */
export function isAppPath(pathname: string): boolean {
  return APP_EXACT.has(pathname) || APP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// 画面のある道。許可の画面は OAuth の頼みを受けて開く。
const PAGE_PATHS: ReadonlySet<string> = new Set(["/", "/authorize"]);

function isPagePath(pathname: string): boolean {
  return PAGE_PATHS.has(pathname);
}

function isHtml(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith("text/html");
}

/**
 * 画面とファイルを返す。ファイルがあればそのまま返し、無い道は画面（index.html）を返す。
 * 画面の無い道は、同じ画面を 404 の状態で返す（表示は「ページが見つかりません」）。
 */
export async function servePage(request: Request, assets: Assets): Promise<Response> {
  const response = await assets.fetch(request);
  // 画面以外のファイル（画像・スクリプトなど）は、あってもなくても配る元の答えのまま
  if (!isHtml(response) && response.status !== 404) return response;
  const { pathname } = new URL(request.url);
  if (pathname === "/index.html") return response;
  const page = isHtml(response)
    ? response
    : await assets.fetch(
        new Request(new URL("/index.html", request.url), { method: request.method })
      );
  if (isPagePath(pathname)) return page;
  return new Response(page.body, { status: 404, headers: page.headers });
}

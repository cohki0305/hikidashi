import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { failure } from "@/server/lib/http";
import { notFound, type Result } from "@/server/lib/result";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";

/** API が使うスキル service の口。実体は bootstrap が組み立てて注入する。 */
export type SkillServicePort = {
  list(query: string): Promise<Result<SkillSummary[]>>;
  show(name: string): Promise<Result<SkillDetailResponse>>;
  preview(name: string, version: number, path: string): Promise<Result<string>>;
  download(
    name: string,
    version: number
  ): Promise<Result<{ body: ReadableStream; size: number; filename: string }>>;
};

export type SkillsEnv = { Variables: { skillService: SkillServicePort } };

/** service を c.var に載せる。無ければ入口を塞ぐ（fail closed）。 */
export function provideSkillService(service?: SkillServicePort) {
  return createMiddleware<SkillsEnv>(async (c, next) => {
    if (!service) return failure(c, notFound("Not found"));
    c.set("skillService", service);
    await next();
  });
}

/** パスを `/` で分けたセグメント（空は除く）。名前と版は英数字とハイフンだけなので戻さない。 */
export function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

/** 版番号は 1 以上の整数だけ。0・先頭 0・数字以外は受けない。 */
export function parseVersion(value: string | null): number | null {
  if (value === null || !/^[1-9][0-9]*$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

/** `/skills/:skillName/versions/:version/{files,download}` の名前と版を末尾から読む。 */
export function versionedSkillParams(pathname: string): { name: string; version: number } | null {
  const segments = pathSegments(pathname);
  const name = segments[segments.length - 4];
  const version = parseVersion(segments[segments.length - 2] ?? null);
  if (name === undefined || version === null) return null;
  return { name, version };
}

/** スキル内の相対パスだけを通す。`..` や先頭 `/` は R2 の別のキーを読ませないため拒否する。 */
export function isSafePreviewPath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** プレビューのテキスト応答。 */
export function okText(c: Context<SkillsEnv>, body: string) {
  return c.body(body, 200, { "Content-Type": "text/plain; charset=utf-8" });
}

/** zip を Worker のメモリに載せずにそのまま流す応答。 */
export function okDownload(
  c: Context<SkillsEnv>,
  file: { body: ReadableStream; size: number; filename: string }
) {
  return c.body(file.body, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${file.filename}"`,
    "Content-Length": String(file.size)
  });
}

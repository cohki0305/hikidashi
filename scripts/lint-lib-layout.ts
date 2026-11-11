/** app/lib と server/lib の直下に置けるファイルを固定する。 */
import type { FileRule } from "./lib/lint-runner-engine";

export type LibLayoutViolation = { file: string; message: string };

const ALLOWED: Record<string, ReadonlySet<string>> = {
  "app/lib": new Set(["api", "utils", "auth-client"]),
  "server/lib": new Set(["result", "http"])
};
const MESSAGES: Record<string, string> = {
  "app/lib":
    "app/lib 直下に置けるのは api / utils / auth-client だけ。ドメイン固有は app/lib/{domain}/、ブラウザ副作用は app/lib/browser/ へ",
  "server/lib":
    "server/lib 直下に置けるのは result / http だけ。ドメイン固有は server/lib/{domain}/ へ"
};
const ROOT_RE = /^(app\/lib|server\/lib)\/([^/]+)\.tsx?$/;

export function findLibLayoutViolations(file: string): LibLayoutViolation[] {
  const rel = file.replaceAll("\\", "/");
  const match = ROOT_RE.exec(rel);
  if (!match) return [];
  const [, root = "", base = ""] = match;
  const stem = base.replace(/\.test$/, "");
  return ALLOWED[root]?.has(stem) ? [] : [{ file: rel, message: MESSAGES[root] ?? "" }];
}

export const RUNNER_FIX =
  "Fix: 横断ユーティリティだけ lib 直下に置く。ドメイン固有は lib/{domain}/、ブラウザ副作用は app/lib/browser/ へ";
export const FILE_RULE: FileRule = {
  include: ROOT_RE,
  check: (file) => findLibLayoutViolations(file)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:lib-layout"]));

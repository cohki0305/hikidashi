/** docs/・README.md・CLAUDE.md に書いた `bun run X` が package.json の scripts に実在することを確かめる。 */
import { readFileSync } from "node:fs";
import path from "node:path";

type ProjectContext = { cwd: string; files: readonly string[]; read: (file: string) => string };

export type DocsRefsViolation = { file: string; line: number; command: string };

const DOC_RE = /^(docs\/.*\.md|(.*\/)?(README|CLAUDE)\.md)$/;
const RUN_RE = /\bbun run[ \t]+([A-Za-z0-9][A-Za-z0-9:_-]*)(?![A-Za-z0-9:_/.{-])/g;

export function findDocsRefsViolations(
  files: readonly string[],
  read: (file: string) => string,
  packageJson: string
): DocsRefsViolation[] {
  const scripts = new Set(
    Object.keys((JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {})
  );
  const violations: DocsRefsViolation[] = [];
  for (const file of files) {
    if (!DOC_RE.test(file)) continue;
    read(file)
      .split("\n")
      .forEach((text, i) => {
        for (const match of text.matchAll(RUN_RE)) {
          const command = match[1] ?? "";
          if (!scripts.has(command)) violations.push({ file, line: i + 1, command });
        }
      });
  }
  return violations;
}

export const RUNNER_FIX =
  "Fix: 文書の `bun run X` は package.json の scripts にある名前だけにする（無くなったコマンドは文書から消す）";

export function docsRefsExecution({ cwd, files, read }: ProjectContext) {
  return {
    finish: () =>
      findDocsRefsViolations(files, read, readFileSync(path.join(cwd, "package.json"), "utf8"))
  };
}

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:docs-refs"]));

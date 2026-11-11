/** server/repositories 直下は `-repository`、server/services 直下は `-service` で終わる名前にする。 */
import type { FileRule } from "./lib/lint-runner-engine";

export type DriftViolation = { file: string; name: string; suffix: string };

const LAYER_RE = /^server\/(repositories|services)\/([^/]+)/;
const SUFFIX = { repositories: "-repository", services: "-service" } as const;

export function findDriftViolations(file: string): DriftViolation[] {
  const rel = file.replaceAll("\\", "/");
  const match = LAYER_RE.exec(rel);
  if (!match) return [];
  const suffix = SUFFIX[match[1] as keyof typeof SUFFIX];
  const name = (match[2] ?? "").replace(/\.tsx?$/, "");
  return name.endsWith(suffix) ? [] : [{ file: rel, name, suffix }];
}

export const RUNNER_FIX =
  "Fix: server/repositories/ 直下は {table}-repository、server/services/ 直下は {name}-service という名前にする";
export const FILE_RULE: FileRule = {
  include: /^server\/(repositories|services)\//,
  optional: true,
  check: (file) => findDriftViolations(file)
};

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:drift"]));

/**
 * drizzle/ の journal・snapshot・sql の整合を確かめる。
 * 連番、when が journal の順に増えること（本番は最後に入れた when より後のものだけ流すので、前後すると黙って飛ばす）、journal と sql / snapshot の対応（足りない・孤児）、空の SQL、snapshot の id と prevId の鎖。
 */

type ProjectContext = { cwd: string; files: readonly string[]; read: (file: string) => string };

export type DrizzleMigrationViolation = {
  file: string;
  rule:
    | "invalid-json"
    | "journal-index"
    | "journal-when"
    | "missing-sql"
    | "missing-snapshot"
    | "orphan-sql"
    | "orphan-snapshot"
    | "empty-sql"
    | "snapshot-chain";
  detail: string;
};

const JOURNAL = "drizzle/meta/_journal.json";
const ROOT_PREV_ID = "00000000-0000-0000-0000-000000000000";
const SQL_RE = /^drizzle\/[^/]+\.sql$/;
const SNAPSHOT_RE = /^drizzle\/meta\/[^/]+_snapshot\.json$/;

/** tag の先頭（`_` の前）が snapshot のファイル名の頭になる。 */
const snapshotFile = (tag: string) => `drizzle/meta/${tag.split("_")[0]}_snapshot.json`;

export function findDrizzleMigrationViolations(
  files: readonly string[],
  read: (file: string) => string
): DrizzleMigrationViolation[] {
  if (!files.includes(JOURNAL)) return [];
  const violations: DrizzleMigrationViolation[] = [];
  const add = (file: string, rule: DrizzleMigrationViolation["rule"], detail: string) =>
    violations.push({ file, rule, detail });
  const json = (file: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(read(file)) as Record<string, unknown>;
    } catch {
      add(file, "invalid-json", "JSON として読めない");
      return null;
    }
  };

  const journal = json(JOURNAL);
  if (!journal) return violations;
  const entries = (journal.entries ?? []) as { idx?: number; tag?: string; when?: number }[];
  const known = new Set<string>();
  const snapshots: string[] = [];
  entries.forEach((entry, i) => {
    const tag = entry.tag ?? "";
    if (entry.idx !== i) add(JOURNAL, "journal-index", `${tag}: idx は ${i} のはずが ${entry.idx}`);
    const prev = entries[i - 1]?.when;
    if (i > 0 && typeof prev === "number" && typeof entry.when === "number" && entry.when <= prev) {
      add(
        JOURNAL,
        "journal-when",
        `${tag}: when が前の ${entries[i - 1]?.tag ?? ""} より後でない（本番で飛ばされる）`
      );
    }
    const sql = `drizzle/${tag}.sql`;
    const snapshot = snapshotFile(tag);
    known.add(sql);
    known.add(snapshot);
    snapshots.push(snapshot);
    if (!files.includes(sql)) add(sql, "missing-sql", "journal にあるのに SQL が無い");
    else if (read(sql).trim() === "") add(sql, "empty-sql", "SQL が空");
    if (!files.includes(snapshot))
      add(snapshot, "missing-snapshot", "journal にあるのに snapshot が無い");
  });
  for (const file of files) {
    if (known.has(file)) continue;
    if (SQL_RE.test(file)) add(file, "orphan-sql", "journal に無い SQL");
    else if (SNAPSHOT_RE.test(file)) add(file, "orphan-snapshot", "journal に無い snapshot");
  }

  let prevId = ROOT_PREV_ID;
  for (const file of snapshots) {
    if (!files.includes(file)) continue;
    const snapshot = json(file);
    if (!snapshot) continue;
    if (snapshot.prevId !== prevId)
      add(file, "snapshot-chain", `prevId が前の snapshot の id（${prevId}）と一致しない`);
    prevId = String(snapshot.id);
  }
  return violations;
}

export const RUNNER_FIX =
  "Fix: drizzle-kit generate で作り直す（適用済みのマイグレーションのファイル名と中身は変えない）。journal・sql・snapshot の対応と snapshot の鎖を揃える。when が前後したら、本番にまだ入っていない側の when を前の when より大きくする";

export function drizzleMigrationsExecution({ files, read }: ProjectContext) {
  return { finish: () => findDrizzleMigrationViolations(files, read) };
}

if (import.meta.main)
  void import("./lint-runner").then(({ runLintCli }) => runLintCli(["lint:drizzle-migrations"]));

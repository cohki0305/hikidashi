import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { SkillDb } from "@/server/db";
import { schema } from "@/server/db/schema";

const MIGRATIONS_DIR = join(import.meta.dir, "../../drizzle");

export type TestDb = {
  db: SkillDb;
  sqlite: Database;
  close: () => void;
};

type BatchQuery = {
  config?: { returning?: unknown };
  all?: () => unknown;
  run?: () => unknown;
};

/** D1 の batch に合わせ、渡された問い合わせを順に実行して結果を並べて返す。 */
function attachBatch<T extends object>(db: T): T {
  return Object.assign(db, {
    batch: async (queries: readonly BatchQuery[]) => {
      const results: unknown[] = [];
      for (const query of queries) {
        const rows =
          query.config?.returning !== undefined ? await query.all?.() : await query.run?.();
        results.push(rows);
      }
      return results;
    }
  });
}

/** drizzle/ のマイグレーションを流したメモリ DB を作る。テストごとに新しく作る。 */
export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  const db = attachBatch(drizzle(sqlite, { schema }));
  return { db, sqlite, close: () => sqlite.close() };
}

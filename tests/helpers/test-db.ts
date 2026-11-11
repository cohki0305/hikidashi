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
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

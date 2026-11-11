import { drizzle } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { schema } from "./schema";

/**
 * repositories が受け取る DB の型。本番は D1（async）、テストは bun:sqlite（sync）なので、
 * 両方を受けられるように結果の種類を union にしている。
 */
export type SkillDb = BaseSQLiteDatabase<"async" | "sync", unknown, typeof schema>;

/** D1 の束縛から drizzle の DB を組み立てる。 */
export function createDb(d1: D1Database): SkillDb {
  return drizzle(d1, { schema });
}

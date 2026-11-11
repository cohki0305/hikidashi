import { desc, eq } from "drizzle-orm";
import { createDb, type SkillDb } from "@/server/db";
import { skills } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** skills テーブルの 1 行。 */
export type SkillRow = typeof skills.$inferSelect;

/** batch にまとめる書き込み 1 文。 */
type BatchStatement = { execute: () => Promise<unknown> };

/** D1 の束縛からスキル API が使う DB ハンドルを作る。 */
export function createSkillDb(d1: D1Database): SkillDb {
  return createDb(d1);
}

/** skills テーブルの読み書き。 */
export class SkillRepository {
  constructor(private readonly db: SkillDb) {}

  /** 一覧は updated_at の新しい順。 */
  async list(): Promise<Result<SkillRow[]>> {
    try {
      return ok(await this.db.select().from(skills).orderBy(desc(skills.updatedAt)).all());
    } catch {
      return upstream("スキル一覧を読めませんでした");
    }
  }

  /** 名前で 1 件引く。無ければ null。 */
  async findByName(name: string): Promise<Result<SkillRow | null>> {
    try {
      const row = await this.db.select().from(skills).where(eq(skills.name, name)).get();
      return ok(row ?? null);
    } catch {
      return upstream("スキルを読めませんでした");
    }
  }

  /** 新しいスキルを作る文。 */
  insertStatement(row: SkillRow): BatchStatement {
    return this.db.insert(skills).values(row);
  }

  /** スキルの表示と最新版を更新する文。 */
  updateStatement(
    id: string,
    fields: Pick<SkillRow, "title" | "description" | "latestVersion" | "updatedAt">
  ): BatchStatement {
    return this.db.update(skills).set(fields).where(eq(skills.id, id));
  }
}

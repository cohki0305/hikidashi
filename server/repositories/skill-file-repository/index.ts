import { and, asc, eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { skillFiles } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** skill_files テーブルの 1 行。 */
export type SkillFileRow = typeof skillFiles.$inferSelect;

/** batch にまとめる書き込み 1 文。 */
type BatchStatement = { execute: () => Promise<unknown> };

/** D1 の変数上限に収めるため、1 文に入れる行数。 */
const MAX_ROWS_PER_STATEMENT = 20;

/** skill_files テーブルの読み書き。 */
export class SkillFileRepository {
  constructor(private readonly db: SkillDb) {}

  /** 版のファイルをパスの順に返す。 */
  async listByVersionId(versionId: string): Promise<Result<SkillFileRow[]>> {
    try {
      return ok(
        await this.db
          .select()
          .from(skillFiles)
          .where(eq(skillFiles.versionId, versionId))
          .orderBy(asc(skillFiles.path))
          .all()
      );
    } catch {
      return upstream("スキルのファイルを読めませんでした");
    }
  }

  /** 版とパスで 1 件引く。無ければ null。 */
  async findByVersionIdAndPath(
    versionId: string,
    path: string
  ): Promise<Result<SkillFileRow | null>> {
    try {
      const row = await this.db
        .select()
        .from(skillFiles)
        .where(and(eq(skillFiles.versionId, versionId), eq(skillFiles.path, path)))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("スキルのファイルを読めませんでした");
    }
  }

  /** 版のファイルを作る文。1 文 20 行ずつに分ける。 */
  insertStatements(rows: readonly SkillFileRow[]): BatchStatement[] {
    const statements: BatchStatement[] = [];
    for (let start = 0; start < rows.length; start += MAX_ROWS_PER_STATEMENT) {
      const batch = rows.slice(start, start + MAX_ROWS_PER_STATEMENT);
      statements.push(this.db.insert(skillFiles).values([...batch]));
    }
    return statements;
  }
}

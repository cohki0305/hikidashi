import { and, desc, eq, inArray } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { skillVersions } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** D1 が 1 回の問い合わせで束縛できる値の上限。 */
const MAX_SKILL_IDS_PER_QUERY = 100;

/** skill_versions テーブルの 1 行。 */
export type SkillVersionRow = typeof skillVersions.$inferSelect;

/** batch にまとめる書き込み 1 文。 */
type BatchStatement = { execute: () => Promise<unknown> };

/** skill_versions テーブルの読み書き。 */
export class SkillVersionRepository {
  constructor(private readonly db: SkillDb) {}

  /** スキルの版を新しい順に返す。 */
  async listBySkillId(skillId: string): Promise<Result<SkillVersionRow[]>> {
    try {
      return ok(
        await this.db
          .select()
          .from(skillVersions)
          .where(eq(skillVersions.skillId, skillId))
          .orderBy(desc(skillVersions.version))
          .all()
      );
    } catch {
      return upstream("スキルの版を読めませんでした");
    }
  }

  /** スキルと版番号で 1 件引く。無ければ null。 */
  async findBySkillIdAndVersion(
    skillId: string,
    version: number
  ): Promise<Result<SkillVersionRow | null>> {
    try {
      const row = await this.db
        .select()
        .from(skillVersions)
        .where(and(eq(skillVersions.skillId, skillId), eq(skillVersions.version, version)))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("スキルの版を読めませんでした");
    }
  }

  /** 複数のスキルの版をまとめて返す。一覧の最新版を引くために使う。 */
  async listBySkillIds(skillIds: readonly string[]): Promise<Result<SkillVersionRow[]>> {
    if (skillIds.length === 0) return ok([]);
    try {
      const rows: SkillVersionRow[] = [];
      // D1 の束縛上限（100）を超えないよう、100 件ずつに分けて引く。
      for (let start = 0; start < skillIds.length; start += MAX_SKILL_IDS_PER_QUERY) {
        const batch = skillIds.slice(start, start + MAX_SKILL_IDS_PER_QUERY);
        rows.push(
          ...(await this.db
            .select()
            .from(skillVersions)
            .where(inArray(skillVersions.skillId, [...batch]))
            .orderBy(desc(skillVersions.version))
            .all())
        );
      }
      return ok(rows);
    } catch {
      return upstream("スキルの版を読めませんでした");
    }
  }

  /** 版を作る文。 */
  insertStatement(row: SkillVersionRow): BatchStatement {
    return this.db.insert(skillVersions).values(row);
  }
}

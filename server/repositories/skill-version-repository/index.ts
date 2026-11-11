import { and, desc, eq, inArray } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { skillVersions } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** skill_versions テーブルの 1 行。 */
export type SkillVersionRow = typeof skillVersions.$inferSelect;

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

  /** 複数のスキルの版をまとめて返す。一覧の最新版を 1 回で引くために使う。 */
  async listBySkillIds(skillIds: readonly string[]): Promise<Result<SkillVersionRow[]>> {
    if (skillIds.length === 0) return ok([]);
    try {
      return ok(
        await this.db
          .select()
          .from(skillVersions)
          .where(inArray(skillVersions.skillId, [...skillIds]))
          .orderBy(desc(skillVersions.version))
          .all()
      );
    } catch {
      return upstream("スキルの版を読めませんでした");
    }
  }
}

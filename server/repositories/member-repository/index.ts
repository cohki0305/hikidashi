import { and, desc, eq, isNull } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { members } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** members テーブルの 1 行。 */
export type Member = typeof members.$inferSelect;

/** メールは小文字にそろえて保存・比較する。 */
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** members テーブルの読み書き。 */
export class MemberRepository {
  constructor(private readonly db: SkillDb) {}

  /** メールで 1 件引く。外した人も返し、無ければ null。 */
  async find(email: string): Promise<Result<Member | null>> {
    try {
      const row = await this.db
        .select()
        .from(members)
        .where(eq(members.email, normalizeEmail(email)))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("メンバーを読めませんでした");
    }
  }

  /** 外していないメンバーを、参加日の新しい順に返す。 */
  async listActive(): Promise<Result<Member[]>> {
    try {
      return ok(
        await this.db
          .select()
          .from(members)
          .where(isNull(members.removedAt))
          .orderBy(desc(members.joinedAt))
          .all()
      );
    } catch {
      return upstream("メンバー一覧を読めませんでした");
    }
  }

  /** 参加を記録する。外した人が戻ってきたら、外した印を消して参加日などを更新する。 */
  async upsertJoined(input: {
    email: string;
    joinedAt: string;
    inviteLinkId: string | null;
  }): Promise<Result<void>> {
    try {
      await this.db
        .insert(members)
        .values({
          email: normalizeEmail(input.email),
          joinedAt: input.joinedAt,
          inviteLinkId: input.inviteLinkId,
          removedAt: null,
          removedBy: null
        })
        .onConflictDoUpdate({
          target: members.email,
          set: {
            joinedAt: input.joinedAt,
            inviteLinkId: input.inviteLinkId,
            removedAt: null,
            removedBy: null
          }
        })
        .run();
      return ok(undefined);
    } catch {
      return upstream("メンバーの参加を記録できませんでした");
    }
  }

  /** 外す。まだ外していない行があったときだけ true。 */
  async markRemoved(input: {
    email: string;
    removedAt: string;
    removedBy: string;
  }): Promise<Result<boolean>> {
    try {
      const rows = await this.db
        .update(members)
        .set({ removedAt: input.removedAt, removedBy: normalizeEmail(input.removedBy) })
        .where(and(eq(members.email, normalizeEmail(input.email)), isNull(members.removedAt)))
        .returning({ email: members.email })
        .all();
      return ok(rows.length > 0);
    } catch {
      return upstream("メンバーを外せませんでした");
    }
  }
}

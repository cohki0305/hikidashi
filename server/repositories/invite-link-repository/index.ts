import { and, desc, eq, isNull } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { inviteLinks } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** invite_links テーブルの 1 行。 */
export type InviteLink = typeof inviteLinks.$inferSelect;

/** メールは小文字にそろえて保存・比較する。 */
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** invite_links テーブルの読み書き。 */
export class InviteLinkRepository {
  constructor(private readonly db: SkillDb) {}

  /** 新しいリンクを保存する。鍵そのものは受け取らない。 */
  async create(row: InviteLink): Promise<Result<void>> {
    try {
      await this.db
        .insert(inviteLinks)
        .values({ ...row, createdBy: normalizeEmail(row.createdBy) })
        .run();
      return ok(undefined);
    } catch {
      return upstream("招待リンクを作れませんでした");
    }
  }

  /** 鍵の hash で 1 件引く。無ければ null。 */
  async findByKeyHash(keyHash: string): Promise<Result<InviteLink | null>> {
    try {
      const row = await this.db
        .select()
        .from(inviteLinks)
        .where(eq(inviteLinks.keyHash, keyHash))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("招待リンクを読めませんでした");
    }
  }

  /** 作った人のリンクを、作った日の新しい順に返す。 */
  async listByCreator(email: string): Promise<Result<InviteLink[]>> {
    try {
      return ok(
        await this.db
          .select()
          .from(inviteLinks)
          .where(eq(inviteLinks.createdBy, normalizeEmail(email)))
          .orderBy(desc(inviteLinks.createdAt))
          .all()
      );
    } catch {
      return upstream("招待リンクの一覧を読めませんでした");
    }
  }

  /** 取り消す。まだ取り消していないリンクのときだけ true。 */
  async revoke(input: { id: string; revokedAt: string }): Promise<Result<boolean>> {
    try {
      const rows = await this.db
        .update(inviteLinks)
        .set({ revokedAt: input.revokedAt })
        .where(and(eq(inviteLinks.id, input.id), isNull(inviteLinks.revokedAt)))
        .returning({ id: inviteLinks.id })
        .all();
      return ok(rows.length > 0);
    } catch {
      return upstream("招待リンクを取り消せませんでした");
    }
  }
}

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
// lint:allow-multi-table: refresh の回転で、使い終わった値を使い済み表へ同じ batch で写す
import { oauthGrants, oauthUsedRefreshTokens } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** oauth_grants テーブルの 1 行。 */
export type OauthGrantRow = typeof oauthGrants.$inferSelect;

/** メールは小文字にそろえて保存・比較する。 */
const normalizeEmail = (email: string) => email.toLowerCase();

/** 最後に使った日時を書き換える間隔。 */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/** D1 の DB は batch を持つが、テストの bun:sqlite は持たない。 */
type BatchCapableDb = { batch?: (queries: readonly unknown[]) => Promise<readonly unknown[]> };

/** メンバーが Claude につなぐことを許した 1 件の読み書き。 */
export class OauthGrantRepository {
  constructor(private readonly db: SkillDb) {}

  /** 新しいつながりを保存する。id を渡さなければ作る。 */
  async create(input: {
    id?: string;
    email: string;
    clientId: string;
    refreshTokenHash: string;
    refreshExpiresAt: string;
    createdAt?: string;
  }): Promise<Result<OauthGrantRow | null>> {
    try {
      const row = await this.db
        .insert(oauthGrants)
        .values({
          ...input,
          id: input.id ?? crypto.randomUUID(),
          createdAt: input.createdAt ?? new Date().toISOString()
        })
        .returning()
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("つながりを保存できませんでした");
    }
  }

  /** id で 1 件引く。無ければ null。 */
  async findById(id: string): Promise<Result<OauthGrantRow | null>> {
    try {
      const row = await this.db.select().from(oauthGrants).where(eq(oauthGrants.id, id)).get();
      return ok(row ?? null);
    } catch {
      return upstream("つながりを読めませんでした");
    }
  }

  /** refresh の hash で 1 件引く。無ければ null。 */
  async findByRefreshHash(hash: string): Promise<Result<OauthGrantRow | null>> {
    try {
      const row = await this.db
        .select()
        .from(oauthGrants)
        .where(eq(oauthGrants.refreshTokenHash, hash))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("つながりを読めませんでした");
    }
  }

  /**
   * refresh を替える。いま持っている値が oldHash のままのときだけ成功し、
   * 古い値を使い済みとして同じ batch のうちに残す。
   */
  async rotateRefresh(
    grantId: string,
    input: { oldHash: string; newHash: string; refreshExpiresAt: string; now: string }
  ): Promise<Result<boolean>> {
    try {
      const update = this.db
        .update(oauthGrants)
        .set({ refreshTokenHash: input.newHash, refreshExpiresAt: input.refreshExpiresAt })
        .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.refreshTokenHash, input.oldHash)))
        .returning({ id: oauthGrants.id });
      // 更新が成功したとき（newHash が入ったとき）だけ、oldHash を使い済みに残す。
      const record = this.db
        .insert(oauthUsedRefreshTokens)
        .select(
          sql`select ${input.oldHash}, ${grantId}, ${input.now} where exists (select 1 from ${oauthGrants} where ${oauthGrants.id} = ${grantId} and ${oauthGrants.refreshTokenHash} = ${input.newHash})`
        )
        .onConflictDoNothing();
      const batch = (this.db as BatchCapableDb).batch;
      if (typeof batch === "function") {
        const results = await batch.call(this.db, [update, record]);
        const rows = (results[0] ?? []) as { id: string }[];
        return ok(rows.length > 0);
      }
      const rows = await update.all();
      if (rows.length === 0) return ok(false);
      await record.run();
      return ok(true);
    } catch {
      return upstream("つながりを更新できませんでした");
    }
  }

  /** つながりを取り消す。取り消し済みなら変えない。 */
  async revoke(grantId: string, now: string): Promise<Result<void>> {
    try {
      await this.db
        .update(oauthGrants)
        .set({ revokedAt: now })
        .where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt)))
        .run();
      return ok(undefined);
    } catch {
      return upstream("つながりを取り消せませんでした");
    }
  }

  /** その人のつながりをすべて取り消す。取り消し済みは変えない。 */
  async revokeByEmail(email: string, now: string): Promise<Result<void>> {
    try {
      await this.db
        .update(oauthGrants)
        .set({ revokedAt: now })
        .where(and(eq(oauthGrants.email, normalizeEmail(email)), isNull(oauthGrants.revokedAt)))
        .run();
      return ok(undefined);
    } catch {
      return upstream("つながりを取り消せませんでした");
    }
  }

  /** 最後に使った日時を、5 分以上たっているときだけ書き換える。 */
  async touch(grantId: string, now: string): Promise<Result<void>> {
    try {
      const staleBefore = new Date(Date.parse(now) - TOUCH_INTERVAL_MS).toISOString();
      await this.db
        .update(oauthGrants)
        .set({ lastUsedAt: now })
        .where(
          and(
            eq(oauthGrants.id, grantId),
            or(isNull(oauthGrants.lastUsedAt), lt(oauthGrants.lastUsedAt, staleBefore))
          )
        )
        .run();
      return ok(undefined);
    } catch {
      return upstream("最後に使った日時を記録できませんでした");
    }
  }
}

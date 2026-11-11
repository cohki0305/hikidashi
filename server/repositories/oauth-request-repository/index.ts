import { and, eq, gt, isNull } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { oauthRequests } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** oauth_requests テーブルの 1 行。 */
export type OauthRequestRow = typeof oauthRequests.$inferSelect;

/** 許可の画面を出すまでの 1 回分の頼みの読み書き。 */
export class OauthRequestRepository {
  constructor(private readonly db: SkillDb) {}

  /** 新しい頼みを保存する。id を渡さなければ作る。 */
  async create(input: {
    id?: string;
    clientId: string;
    redirectUri: string;
    state: string | null;
    codeChallenge: string;
    resource: string | null;
    expiresAt: string;
  }): Promise<Result<OauthRequestRow | null>> {
    try {
      const row = await this.db
        .insert(oauthRequests)
        .values({ ...input, id: input.id ?? crypto.randomUUID() })
        .returning()
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("つなぐ頼みを保存できませんでした");
    }
  }

  /** id で 1 件引く。無ければ null。 */
  async findById(id: string): Promise<Result<OauthRequestRow | null>> {
    try {
      const row = await this.db.select().from(oauthRequests).where(eq(oauthRequests.id, id)).get();
      return ok(row ?? null);
    } catch {
      return upstream("つなぐ頼みを読めませんでした");
    }
  }

  /** 許可した人とコードを結ぶ。期限内でまだ何もされていない頼みだけ 1 回成功する。 */
  async approve(
    id: string,
    input: { email: string; codeHash: string },
    now = new Date().toISOString()
  ): Promise<Result<boolean>> {
    try {
      const rows = await this.db
        .update(oauthRequests)
        .set({ email: input.email, codeHash: input.codeHash })
        .where(
          and(
            eq(oauthRequests.id, id),
            isNull(oauthRequests.usedAt),
            isNull(oauthRequests.deniedAt),
            isNull(oauthRequests.email),
            gt(oauthRequests.expiresAt, now)
          )
        )
        .returning({ id: oauthRequests.id })
        .all();
      return ok(rows.length > 0);
    } catch {
      return upstream("つなぐ頼みを許可できませんでした");
    }
  }

  /** 「やめる」。期限内でまだ何もされていない頼みだけ 1 回成功する。 */
  async markDenied(id: string, now = new Date().toISOString()): Promise<Result<boolean>> {
    try {
      const rows = await this.db
        .update(oauthRequests)
        .set({ deniedAt: now })
        .where(
          and(
            eq(oauthRequests.id, id),
            isNull(oauthRequests.usedAt),
            isNull(oauthRequests.deniedAt),
            isNull(oauthRequests.email),
            gt(oauthRequests.expiresAt, now)
          )
        )
        .returning({ id: oauthRequests.id })
        .all();
      return ok(rows.length > 0);
    } catch {
      return upstream("つなぐ頼みを断れませんでした");
    }
  }

  /** コードを使い済みにして頼みを返す。同じコードで 1 回だけ成功する。 */
  async consumeCode(codeHash: string, now: string): Promise<Result<OauthRequestRow | null>> {
    try {
      const row = await this.db
        .update(oauthRequests)
        .set({ usedAt: now })
        .where(and(eq(oauthRequests.codeHash, codeHash), isNull(oauthRequests.usedAt)))
        .returning()
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("コードを引き換えられませんでした");
    }
  }
}

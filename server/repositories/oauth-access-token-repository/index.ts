import { and, eq, gt, isNull } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
// lint:allow-multi-table: トークンが生きているかを grant と join して 1 回で確かめる
import { oauthAccessTokens, oauthGrants } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** oauth_access_tokens テーブルの 1 行。 */
export type OauthAccessTokenRow = typeof oauthAccessTokens.$inferSelect;

/** アクセストークンの読み書き。 */
export class OauthAccessTokenRepository {
  constructor(private readonly db: SkillDb) {}

  /** 新しいアクセストークンを保存する。 */
  async create(input: {
    tokenHash: string;
    grantId: string;
    expiresAt: string;
  }): Promise<Result<void>> {
    try {
      await this.db.insert(oauthAccessTokens).values(input).run();
      return ok(undefined);
    } catch {
      return upstream("アクセストークンを保存できませんでした");
    }
  }

  /** 期限内で、取り消されていない grant のトークンだけ返す。 */
  async findLive(
    tokenHash: string,
    now: string
  ): Promise<Result<{ grantId: string; email: string } | null>> {
    try {
      const row = await this.db
        .select({ grantId: oauthAccessTokens.grantId, email: oauthGrants.email })
        .from(oauthAccessTokens)
        .innerJoin(oauthGrants, eq(oauthAccessTokens.grantId, oauthGrants.id))
        .where(
          and(
            eq(oauthAccessTokens.tokenHash, tokenHash),
            gt(oauthAccessTokens.expiresAt, now),
            isNull(oauthGrants.revokedAt),
            gt(oauthGrants.refreshExpiresAt, now)
          )
        )
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("アクセストークンを読めませんでした");
    }
  }
}

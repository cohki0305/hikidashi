import { eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { oauthUsedRefreshTokens } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** 使い終わった refresh の hash を読む。 */
export class OauthUsedRefreshTokenRepository {
  constructor(private readonly db: SkillDb) {}

  /** 使い終わった hash が結ばれている grant の id。無ければ null。 */
  async findGrantId(tokenHash: string): Promise<Result<string | null>> {
    try {
      const row = await this.db
        .select({ grantId: oauthUsedRefreshTokens.grantId })
        .from(oauthUsedRefreshTokens)
        .where(eq(oauthUsedRefreshTokens.tokenHash, tokenHash))
        .get();
      return ok(row?.grantId ?? null);
    } catch {
      return upstream("使い終わったトークンを読めませんでした");
    }
  }
}

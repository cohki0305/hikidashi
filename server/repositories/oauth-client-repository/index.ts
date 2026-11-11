import { eq } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { oauthClients } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** oauth_clients テーブルの 1 行。 */
export type OauthClientRow = typeof oauthClients.$inferSelect;

/** 連携するアプリ（OAuth のクライアント）の読み書き。 */
export class OauthClientRepository {
  constructor(private readonly db: SkillDb) {}

  /** 新しく登録する。戻り先は配列のまま保存する。 */
  async create(input: {
    id: string;
    clientName: string;
    redirectUris: string[];
  }): Promise<Result<OauthClientRow | null>> {
    try {
      const row = await this.db
        .insert(oauthClients)
        .values({ ...input, createdAt: new Date().toISOString() })
        .returning()
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("連携するアプリを保存できませんでした");
    }
  }

  /** id で 1 件引く。無ければ null。 */
  async findById(
    id: string
  ): Promise<Result<{ id: string; clientName: string; redirectUris: string[] } | null>> {
    try {
      const row = await this.db
        .select({
          id: oauthClients.id,
          clientName: oauthClients.clientName,
          redirectUris: oauthClients.redirectUris
        })
        .from(oauthClients)
        .where(eq(oauthClients.id, id))
        .get();
      return ok(row ?? null);
    } catch {
      return upstream("連携するアプリを読めませんでした");
    }
  }
}

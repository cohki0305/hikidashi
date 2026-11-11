import { and, asc, eq, lte } from "drizzle-orm";
import type { SkillDb } from "@/server/db";
import { uploads } from "@/server/db/schema";
import { ok, type Result, upstream } from "@/server/lib/result";

/** 1 回の batch にまとめる書き込み 1 文。各リポジトリが自分のテーブルの文を組み立てる。 */
export type BatchStatement = { execute: () => Promise<unknown> };

/** uploads テーブルの 1 行。 */
export type UploadRow = typeof uploads.$inferSelect;

export type NewUpload = {
  id: string;
  r2Key: string;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
};

type BatchableDb = SkillDb & {
  batch?: (items: readonly BatchStatement[]) => Promise<unknown>;
};

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  return `${error.message} ${cause instanceof Error ? cause.message : String(cause ?? "")}`;
}

/** 同時公開で競合する一意制約だけを拾う。uploads や skill_files の衝突は別の失敗。 */
function isUniqueViolation(error: unknown): boolean {
  const text = errorText(error);
  return (
    /unique constraint failed:\s*skills\.name/i.test(text) ||
    /unique constraint failed:\s*skill_versions\.skill_id,\s*skill_versions\.version/i.test(text)
  );
}

/** D1 とテストの同期 DB で形の違う更新件数を読む。 */
function changesOf(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const result = value as { changes?: unknown; meta?: { changes?: unknown } };
  if (typeof result.changes === "number") return result.changes;
  if (result.meta !== undefined && typeof result.meta.changes === "number")
    return result.meta.changes;
  return 0;
}

/** uploads テーブルの読み書き。公開途中の zip の受け皿を扱う。 */
export class UploadRepository {
  constructor(private readonly db: SkillDb) {}

  /** 受け皿を 1 件引く。無ければ null。 */
  async findById(id: string): Promise<Result<UploadRow | null>> {
    try {
      const row = await this.db.select().from(uploads).where(eq(uploads.id, id)).get();
      return ok(row ?? null);
    } catch {
      return upstream("受け皿を読めませんでした");
    }
  }

  /** pending の受け皿を作る。 */
  async insertPending(input: NewUpload): Promise<Result<void>> {
    try {
      await this.insertPendingStatement(input).execute();
      return ok(undefined);
    } catch {
      return upstream("受け皿を作れませんでした");
    }
  }

  /** pending の受け皿を作る文。batch に混ぜるときに使う。 */
  insertPendingStatement(input: NewUpload): BatchStatement {
    return this.db.insert(uploads).values({ ...input, status: "pending" });
  }

  /** pending かつ期限切れの受け皿を古い順に返す。 */
  async listExpiredPending(now: string, limit = 100): Promise<Result<UploadRow[]>> {
    try {
      const rows = await this.db
        .select()
        .from(uploads)
        .where(and(eq(uploads.status, "pending"), lte(uploads.expiresAt, now)))
        .orderBy(asc(uploads.expiresAt))
        .limit(limit)
        .all();
      return ok(rows);
    } catch {
      return upstream("期限切れの受け皿を読めませんでした");
    }
  }

  /** pending の受け皿だけを used にする文。 */
  markUsedStatement(id: string): BatchStatement {
    return this.db
      .update(uploads)
      .set({ status: "used" })
      .where(and(eq(uploads.id, id), eq(uploads.status, "pending")));
  }

  /** pending の受け皿だけを used にし、実際に更新できたかを返す。 */
  async markUsedIfPending(id: string): Promise<Result<boolean>> {
    try {
      const result = await this.markUsedStatement(id).execute();
      return ok(changesOf(result) > 0);
    } catch {
      return upstream("受け皿を使用済みにできませんでした");
    }
  }

  /** pending の受け皿だけを expired にし、実際に期限切れにできたかを返す。 */
  async markExpired(id: string): Promise<Result<boolean>> {
    try {
      const result = await this.db
        .update(uploads)
        .set({ status: "expired" })
        .where(and(eq(uploads.id, id), eq(uploads.status, "pending")))
        .execute();
      return ok(changesOf(result) > 0);
    } catch {
      return upstream("受け皿を期限切れにできませんでした");
    }
  }

  /**
   * 受け皿の書き込みを含む文を 1 回の batch で実行する。
   * D1 では本当に 1 回、テストの同期 DB では順に実行する。
   */
  async commit(statements: readonly BatchStatement[]): Promise<Result<void>> {
    try {
      const batch = (this.db as BatchableDb).batch;
      if (typeof batch === "function") {
        await batch.call(this.db, statements);
      } else {
        for (const statement of statements) await statement.execute();
      }
      return ok(undefined);
    } catch (error) {
      return isUniqueViolation(error)
        ? upstream("公開の記録を保存できませんでした", { unique: true })
        : upstream("公開の記録を保存できませんでした");
    }
  }
}

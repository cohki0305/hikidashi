import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique
} from "drizzle-orm/sqlite-core";

/** スキルのメタデータ。name は SKILL.md の name で、同じ name は 1 行だけ。 */
export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    latestVersion: integer("latest_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [check("skills_latest_version_check", sql`${table.latestVersion} >= 1`)]
);

/** スキルの版。版ごとに zip を R2 に置き、上書きしない。 */
export const skillVersions = sqliteTable(
  "skill_versions",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    fileCount: integer("file_count").notNull(),
    note: text("note"),
    publishedBy: text("published_by").notNull(),
    r2Key: text("r2_key").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [unique("skill_versions_skill_id_version_unique").on(table.skillId, table.version)]
);

/** 版に含まれるファイル。中身は持たず、プレビューは zip_offset から範囲読み出しする。 */
export const skillFiles = sqliteTable(
  "skill_files",
  {
    versionId: text("version_id")
      .notNull()
      .references(() => skillVersions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    isText: integer("is_text", { mode: "boolean" }).notNull(),
    zipOffset: integer("zip_offset").notNull()
  },
  (table) => [primaryKey({ columns: [table.versionId, table.path] })]
);

/** 公開途中の zip の受け皿。公開が終わったら used、期限切れは expired にする。 */
export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    r2Key: text("r2_key").notNull(),
    createdBy: text("created_by").notNull(),
    status: text("status").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    index("uploads_status_expires_at_idx").on(table.status, table.expiresAt),
    check("uploads_status_check", sql`${table.status} in ('pending', 'used', 'expired')`)
  ]
);

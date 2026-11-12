import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 招待リンク。鍵そのものは保存せず、SHA-256 の 16 進だけを持つ。 */
export const inviteLinks = sqliteTable(
  "invite_links",
  {
    id: text("id").primaryKey(),
    keyHash: text("key_hash").notNull().unique(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at")
  },
  (table) => [
    index("invite_links_created_by_idx").on(table.createdBy),
    check("invite_links_key_hash_length", sql`length(${table.keyHash}) = 64`),
    check("invite_links_created_by_lower", sql`${table.createdBy} = lower(${table.createdBy})`),
    check("invite_links_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`)
  ]
);

/** メンバー。外した人は行を消さず、removed_at と removed_by を入れる。 */
export const members = sqliteTable(
  "members",
  {
    email: text("email").primaryKey(),
    joinedAt: text("joined_at").notNull(),
    inviteLinkId: text("invite_link_id").references(() => inviteLinks.id, {
      onDelete: "set null"
    }),
    removedAt: text("removed_at"),
    removedBy: text("removed_by")
  },
  (table) => [
    index("members_invite_link_id_idx").on(table.inviteLinkId),
    check("members_email_lower", sql`${table.email} = lower(${table.email})`),
    check(
      "members_removed_by_lower",
      sql`${table.removedBy} is null or ${table.removedBy} = lower(${table.removedBy})`
    ),
    check("members_removed_pair", sql`(${table.removedAt} is null) = (${table.removedBy} is null)`)
  ]
);

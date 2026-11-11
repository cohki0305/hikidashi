import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** AI のサービスが自分で登録する連携の窓口。登録は誰でもできるので、メンバーには結ばない。 */
export const oauthClients = sqliteTable(
  "oauth_clients",
  {
    id: text("id").primaryKey(),
    clientName: text("client_name").notNull(),
    redirectUris: text("redirect_uris", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    check("oauth_clients_client_name_length", sql`length(${table.clientName}) between 1 and 100`)
  ]
);

/** 許可の画面を出すまでの 1 回分の頼み。許可したあと、コードの引き換えに使う。 */
export const oauthRequests = sqliteTable(
  "oauth_requests",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    state: text("state"),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource"),
    expiresAt: text("expires_at").notNull(),
    email: text("email"),
    codeHash: text("code_hash").unique(),
    usedAt: text("used_at"),
    deniedAt: text("denied_at"),
    grantId: text("grant_id")
  },
  (table) => [index("oauth_requests_expires_at_idx").on(table.expiresAt)]
);

/** メンバーが Claude につなぐことを許した 1 件。取り消すと、その grant のトークンはすべて使えなくなる。 */
export const oauthGrants = sqliteTable(
  "oauth_grants",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    refreshExpiresAt: text("refresh_expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at")
  },
  (table) => [index("oauth_grants_email_idx").on(table.email)]
);

export const oauthAccessTokens = sqliteTable(
  "oauth_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull()
  },
  (table) => [index("oauth_access_tokens_grant_id_idx").on(table.grantId)]
);

/** 使い終わった refresh の hash。どの古い値がもう一度来ても、その grant を取り消せるように結んで残す。 */
export const oauthUsedRefreshTokens = sqliteTable(
  "oauth_used_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    usedAt: text("used_at").notNull()
  },
  (table) => [index("oauth_used_refresh_tokens_grant_id_idx").on(table.grantId)]
);

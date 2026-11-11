export * from "./oauth";
export {
  oauthAccessTokens,
  oauthClients,
  oauthGrants,
  oauthRequests,
  oauthUsedRefreshTokens
} from "./oauth";
export * from "./skills";
export { skillFiles, skills, skillVersions, uploads } from "./skills";

import {
  oauthAccessTokens,
  oauthClients,
  oauthGrants,
  oauthRequests,
  oauthUsedRefreshTokens
} from "./oauth";
import { skillFiles, skills, skillVersions, uploads } from "./skills";

/** drizzle に渡すテーブルの一覧。リレーションはまだ無い。 */
export const schema = {
  skills,
  skillVersions,
  skillFiles,
  uploads,
  oauthClients,
  oauthRequests,
  oauthGrants,
  oauthAccessTokens,
  oauthUsedRefreshTokens
};

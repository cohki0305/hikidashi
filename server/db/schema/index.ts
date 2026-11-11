export * from "./skills";
export { skillFiles, skills, skillVersions, uploads } from "./skills";

import { skillFiles, skills, skillVersions, uploads } from "./skills";

/** drizzle に渡すテーブルの一覧。リレーションはまだ無い。 */
export const schema = { skills, skillVersions, skillFiles, uploads };

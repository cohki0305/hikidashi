import { z } from "zod";

/** スキルの識別子。英小文字・数字・ハイフンで、1〜64 文字（設計書 §5.1）。 */
export const skillNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

/** 一覧・詳細に出すスキルの要約。 */
export const skillSummarySchema = z.object({
  name: skillNameSchema,
  title: z.string(),
  description: z.string(),
  latestVersion: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  author: z.email(),
  sizeBytes: z.number().int().nonnegative(),
  claudeCodeOnly: z.boolean()
});
export type SkillSummary = z.infer<typeof skillSummarySchema>;

/** GET /api/skills の応答。 */
export const skillListResponseSchema = z.object({
  skills: z.array(skillSummarySchema)
});
export type SkillListResponse = z.infer<typeof skillListResponseSchema>;

/** 版に含まれるファイル 1 つ分の情報。中身は持たない。 */
export const skillFileSchema = z.object({
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  isText: z.boolean()
});
export type SkillFile = z.infer<typeof skillFileSchema>;

/** スキルの版 1 つ分の情報。 */
export const skillVersionSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().nullable(),
  publishedBy: z.email(),
  createdAt: z.string(),
  fingerprint: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative()
});
export type SkillVersion = z.infer<typeof skillVersionSchema>;

/** GET /api/skills/:name の応答。versions は新しい順。 */
export const skillDetailResponseSchema = z.object({
  skill: skillSummarySchema,
  files: z.array(skillFileSchema),
  versions: z.array(skillVersionSchema)
});
export type SkillDetailResponse = z.infer<typeof skillDetailResponseSchema>;

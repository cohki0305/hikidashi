import { z } from "zod";
import { skillNameSchema } from "./skills";

/** 手元に入れたスキル 1 つ分の目印。 */
export const installedSkillSchema = z.object({
  name: skillNameSchema,
  version: z.number().int().positive(),
  fingerprint: z.string().min(1)
});
export type InstalledSkill = z.infer<typeof installedSkillSchema>;

/** MCP の check_skill_updates が受け取る、手元のスキルの一覧。 */
export const checkSkillUpdatesInputSchema = z.object({
  installed: z.array(installedSkillSchema).max(200)
});
export type CheckSkillUpdatesInput = z.infer<typeof checkSkillUpdatesInputSchema>;

/** MCP の list_skills が受け取る、探す言葉。 */
export const listSkillsInputSchema = z.object({
  query: z.string().trim().max(200).optional()
});
export type ListSkillsInput = z.infer<typeof listSkillsInputSchema>;

/** MCP の install_skill が受け取る、入れるスキルの名前と版。 */
export const installSkillInputSchema = z.object({
  name: skillNameSchema,
  version: z.number().int().positive().optional()
});
export type InstallSkillInput = z.infer<typeof installSkillInputSchema>;

/** MCP の begin_publish が受け取る入力（無し）。 */
export const beginPublishInputSchema = z.object({});
export type BeginPublishInput = z.infer<typeof beginPublishInputSchema>;

/** MCP の finish_publish が受け取る、受け皿と公開のメモ。 */
export const finishPublishInputSchema = z.object({
  uploadId: z.string().min(1),
  note: z.string().max(500).optional()
});
export type FinishPublishInput = z.infer<typeof finishPublishInputSchema>;

/** install_skill が返す、入れるスキルの版とダウンロード先。 */
export const installInfoSchema = z.object({
  name: skillNameSchema,
  version: z.number().int().positive(),
  fingerprint: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  claudeCodeOnly: z.boolean(),
  downloadUrl: z.string().min(1),
  expiresInSeconds: z.number().int().positive()
});
export type InstallInfo = z.infer<typeof installInfoSchema>;

/** begin_publish が返す、アップロードの受け皿。 */
export const publishTicketSchema = z.object({
  uploadId: z.string().min(1),
  uploadUrl: z.string().min(1),
  expiresAt: z.string().min(1),
  maxBytes: z.number().int().positive()
});
export type PublishTicket = z.infer<typeof publishTicketSchema>;

/** finish_publish が返す、公開の結果。公開できたときだけ新しい指紋を返す。 */
export const finishPublishResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("published"),
    name: skillNameSchema,
    version: z.number().int().positive(),
    fingerprint: z.string().min(1),
    fileCount: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative()
  }),
  z.object({
    status: z.literal("unchanged"),
    name: skillNameSchema,
    version: z.number().int().positive()
  })
]);
export type FinishPublishResult = z.infer<typeof finishPublishResultSchema>;

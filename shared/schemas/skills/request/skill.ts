import { z } from "zod";
import { skillNameSchema } from "@/shared/schemas/skills";

export const skillNameParamsSchema = z.object({
  skillName: skillNameSchema
});

export const skillVersionParamsSchema = z.object({
  skillName: skillNameSchema,
  version: z.coerce.number().int().positive()
});

export const skillListQuerySchema = z.object({
  query: z.string().optional().default("")
});

function isSafePreviewPath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export const previewQuerySchema = z.object({
  path: z.string().refine(isSafePreviewPath)
});

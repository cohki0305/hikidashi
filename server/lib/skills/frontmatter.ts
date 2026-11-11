import { parse } from "yaml";
import { invalid, ok, type Result } from "@/server/lib/result";
import { skillNameSchema } from "@/shared/schemas/skills";

export type SkillFrontmatter = {
  name: string;
  description: string;
  title: string;
};

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_TITLE_LENGTH = 100;

function between(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

/** SKILL.md の先頭にある frontmatter（`---` で囲まれた YAML）を読む。 */
export function parseSkillFrontmatter(text: string): Result<SkillFrontmatter> {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return invalid("SKILL.md の先頭に frontmatter がありません");

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return invalid("SKILL.md の frontmatter が閉じられていません");

  let data: unknown;
  try {
    data = parse(lines.slice(1, end).join("\n"));
  } catch {
    return invalid("SKILL.md の frontmatter を YAML として読めませんでした");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data))
    return invalid("SKILL.md の frontmatter が正しくありません");

  const frontmatter = data as Record<string, unknown>;

  if (typeof frontmatter.name !== "string" || !skillNameSchema.safeParse(frontmatter.name).success)
    return invalid("SKILL.md の name が規則に合いません");

  if (
    typeof frontmatter.description !== "string" ||
    !between(frontmatter.description, 1, MAX_DESCRIPTION_LENGTH)
  )
    return invalid("SKILL.md の description は 1〜1024 字にしてください");

  if (frontmatter.title === undefined || frontmatter.title === null) {
    return ok({
      name: frontmatter.name,
      description: frontmatter.description,
      title: frontmatter.name
    });
  }

  if (typeof frontmatter.title !== "string" || !between(frontmatter.title, 1, MAX_TITLE_LENGTH))
    return invalid("SKILL.md の title は 1〜100 字にしてください");

  return ok({
    name: frontmatter.name,
    description: frontmatter.description,
    title: frontmatter.title
  });
}

import { describe, expect, test } from "bun:test";
import { parseSkillFrontmatter } from "./frontmatter";

function text(frontmatter: string, body = "\n# 見本\n"): string {
  return `---\n${frontmatter}\n---${body}`;
}

describe("parseSkillFrontmatter", () => {
  test("name・description・title を読む", () => {
    const result = parseSkillFrontmatter(
      text("name: sample-skill\ndescription: 見本のスキルです\ntitle: 見本スキル")
    );

    expect(result).toEqual({
      ok: true,
      value: {
        name: "sample-skill",
        description: "見本のスキルです",
        title: "見本スキル"
      }
    });
  });

  test("title が無ければ name を使う", () => {
    const result = parseSkillFrontmatter(text("name: sample-skill\ndescription: 見本のスキルです"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("sample-skill");
  });

  test("name が規則に合わなければ invalid", () => {
    const result = parseSkillFrontmatter(text("name: Sample Skill\ndescription: 見本のスキルです"));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("description が無ければ invalid", () => {
    const result = parseSkillFrontmatter(text("name: sample-skill"));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("description が長すぎれば invalid", () => {
    const result = parseSkillFrontmatter(
      text(`name: sample-skill\ndescription: ${"あ".repeat(1025)}`)
    );

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("title が長すぎれば invalid", () => {
    const result = parseSkillFrontmatter(
      text(`name: sample-skill\ndescription: 見本のスキルです\ntitle: ${"あ".repeat(101)}`)
    );

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("先頭に frontmatter が無ければ invalid", () => {
    const result = parseSkillFrontmatter("# 見本\n\nname: sample-skill\n");

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("YAML として読めなければ invalid", () => {
    const result = parseSkillFrontmatter(text("name: [sample-skill"));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("CRLF の改行でも読める", () => {
    const result = parseSkillFrontmatter(
      "---\r\nname: sample-skill\r\ndescription: 見本のスキルです\r\n---\r\n# 見本\r\n"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("sample-skill");
  });
});

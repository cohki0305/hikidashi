import { describe, expect, test } from "bun:test";
import { MCP_TOOLS } from "./tools";

describe("MCP_TOOLS", () => {
  test("この issue で載せる 2 つのツールを 1 か所に並べる", () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(["list_skills", "check_skill_updates"]);
  });

  test("説明文は非エンジニアが読める日本語", () => {
    const descriptions = Object.fromEntries(MCP_TOOLS.map((tool) => [tool.name, tool.description]));
    expect(descriptions.list_skills).toBe(
      "チームで共有しているスキルを探します。query に言葉を入れると、名前と説明で絞り込みます。"
    );
    expect(descriptions.check_skill_updates).toBe(
      "手元に入れたスキルに新しい版があるかを確かめます。~/.claude/skills/*/.hikidashi.json の name・version・fingerprint を並べて渡してください。更新があっても勝手に上書きせず、利用者の同意を得てください。"
    );
  });

  test("入力は zod の schema で受ける", () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("list_skills")?.input.safeParse({}).success).toBe(true);
    expect(byName.get("check_skill_updates")?.input.safeParse({}).success).toBe(false);
  });
});

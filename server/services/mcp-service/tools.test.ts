import { describe, expect, test } from "bun:test";
import { MCP_TOOLS } from "./tools";

describe("MCP_TOOLS", () => {
  test("この issue で載せる 5 つのツールを 1 か所に並べる", () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "list_skills",
      "check_skill_updates",
      "install_skill",
      "begin_publish",
      "finish_publish"
    ]);
  });

  test("説明文は非エンジニアが読める日本語", () => {
    const descriptions = Object.fromEntries(MCP_TOOLS.map((tool) => [tool.name, tool.description]));
    expect(descriptions.list_skills).toBe(
      "チームで共有しているスキルを探します。query に言葉を入れると、名前と説明で絞り込みます。"
    );
    expect(descriptions.check_skill_updates).toBe(
      "手元に入れたスキルに新しい版があるかを確かめます。~/.claude/skills/*/.hikidashi.json の name・version・fingerprint を並べて渡してください。更新があっても勝手に上書きせず、利用者の同意を得てください。"
    );
    expect(descriptions.install_skill).toBe(
      "チームのスキルを手元に入れるための、10 分だけ使えるダウンロード URL を返します。返ってきた steps の手順に従ってください。手元に同じスキルがあるときは、入れ直してよいか利用者に確かめてから置き換えてください。"
    );
    expect(descriptions.begin_publish).toBe(
      "Claude Code 専用です。スキルを公開するための、30 分だけ使えるアップロード先を作ります。返ってきた steps の手順で zip を送り、最後に finish_publish を呼んでください。"
    );
    expect(descriptions.finish_publish).toBe(
      "begin_publish で送った zip を検査して、新しい版として公開します。中身が最新版と同じなら版は増えず、変更なしと返します。公開できたら、名前と版を利用者に伝え、手元の .hikidashi.json を新しい版と指紋に書き換えてください。"
    );
  });

  test("入力は zod の schema で受ける", () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("list_skills")?.input.safeParse({}).success).toBe(true);
    expect(byName.get("check_skill_updates")?.input.safeParse({}).success).toBe(false);
    expect(byName.get("install_skill")?.input.safeParse({ name: "invoice-entry" }).success).toBe(
      true
    );
    expect(byName.get("begin_publish")?.input.safeParse({}).success).toBe(true);
    expect(byName.get("finish_publish")?.input.safeParse({ uploadId: "upload-1" }).success).toBe(
      true
    );
  });
});

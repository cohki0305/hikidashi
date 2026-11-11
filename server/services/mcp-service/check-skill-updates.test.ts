import { describe, expect, test } from "bun:test";
import type { McpToolContext, SkillCatalog } from "@/server/lib/mcp/json-rpc";
import { notFound, ok } from "@/server/lib/result";
import { checkSkillUpdatesTool } from "./check-skill-updates";

const latest: Record<string, { latestVersion: number; fingerprint: string }> = {
  "same-skill": { latestVersion: 3, fingerprint: "fp-same" },
  "new-skill": { latestVersion: 4, fingerprint: "fp-new" }
};

function buildCatalog() {
  const calls: string[][] = [];
  const skills: SkillCatalog = {
    list: async () => ok([]),
    show: async () => notFound("スキルが見つかりません"),
    latestByNames: async (names) => {
      calls.push([...names]);
      return ok(
        names.flatMap((name) => {
          const found = latest[name];
          return found === undefined ? [] : [{ name, ...found }];
        })
      );
    }
  };
  const context: McpToolContext = {
    email: "member@example.test",
    skills,
    install: { installInfo: async () => notFound("使いません") }
  };
  return { calls, context };
}

describe("check_skill_updates", () => {
  test("指紋が同じなら版番号が違っても up_to_date", async () => {
    const { calls, context } = buildCatalog();
    const result = await checkSkillUpdatesTool.call(context, {
      installed: [{ name: "same-skill", version: 1, fingerprint: "fp-same" }]
    });
    expect(result).toEqual({
      ok: true,
      value: {
        results: [
          {
            name: "same-skill",
            status: "up_to_date",
            installedVersion: 1,
            latestVersion: 3
          }
        ]
      }
    });
    expect(calls).toEqual([["same-skill"]]);
  });

  test("指紋が違えば update_available、無いスキルは not_found", async () => {
    const { calls, context } = buildCatalog();
    const result = await checkSkillUpdatesTool.call(context, {
      installed: [
        { name: "new-skill", version: 2, fingerprint: "fp-old" },
        { name: "missing-skill", version: 1, fingerprint: "fp-missing" }
      ]
    });
    expect(result).toEqual({
      ok: true,
      value: {
        results: [
          {
            name: "new-skill",
            status: "update_available",
            installedVersion: 2,
            latestVersion: 4
          },
          { name: "missing-skill", status: "not_found", installedVersion: 1 }
        ]
      }
    });
    expect(calls).toEqual([["new-skill", "missing-skill"]]);
  });
});

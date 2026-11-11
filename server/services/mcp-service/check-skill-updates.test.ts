import { describe, expect, test } from "bun:test";
import { notFound, ok } from "@/server/lib/result";
import type { SkillService } from "@/server/services/skill-service";
import type { SkillDetailResponse } from "@/shared/schemas/skills";
import { checkSkillUpdatesTool } from "./check-skill-updates";

function detail(name: string, version: number, fingerprint: string): SkillDetailResponse {
  return {
    skill: {
      name,
      title: name,
      description: `${name} の説明`,
      latestVersion: version,
      updatedAt: "2026-10-20T00:00:00.000Z",
      author: "hanako@example.test",
      sizeBytes: 10,
      claudeCodeOnly: false
    },
    files: [],
    versions: [
      {
        version,
        note: null,
        publishedBy: "hanako@example.test",
        createdAt: "2026-10-20T00:00:00.000Z",
        fingerprint,
        sizeBytes: 10,
        fileCount: 1
      }
    ]
  };
}

const details: Record<string, SkillDetailResponse> = {
  "same-skill": detail("same-skill", 3, "fp-same"),
  "new-skill": detail("new-skill", 4, "fp-new")
};

const skills = {
  show: async (name: string) => {
    const found = details[name];
    return found ? ok(found) : notFound("スキルが見つかりません");
  }
} as Pick<SkillService, "list" | "show">;

function context() {
  return { email: "member@example.test", skills } as unknown as Parameters<
    typeof checkSkillUpdatesTool.call
  >[0];
}

describe("check_skill_updates", () => {
  test("指紋が同じなら版番号が違っても up_to_date", async () => {
    const result = await checkSkillUpdatesTool.call(context(), {
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
  });

  test("指紋が違えば update_available、無いスキルは not_found", async () => {
    const result = await checkSkillUpdatesTool.call(context(), {
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
  });
});

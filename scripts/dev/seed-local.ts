import { createDb, type SkillDb } from "@/server/db";
import { skills } from "@/server/db/schema";
import { type SeedSkillOptions, seedSkill } from "@/tests/helpers/seed-skill";

/** 手元で入れるスキル。3 件のうち 1 件はバイナリを含む。 */
export const SEED_SKILLS: SeedSkillOptions[] = [
  {
    name: "code-review",
    title: "コードレビュー",
    versions: 2,
    files: {
      "SKILL.md": [
        "# コードレビュー",
        "",
        "変更を読み、正しさ・読みやすさ・テストの観点で指摘する。",
        ""
      ].join("\n"),
      "references/checklist.md": [
        "# チェックリスト",
        "",
        "- 入力と失敗の扱いが変わっていないか",
        "- テストが仕様を表しているか",
        ""
      ].join("\n")
    }
  },
  {
    name: "meeting-notes",
    title: "議事録づくり",
    files: {
      "SKILL.md": [
        "# 議事録づくり",
        "",
        "会話の記録から、決まったこと・決まっていないこと・次の行動を分けて書く。",
        ""
      ].join("\n"),
      "references/template.md": ["# 議事録", "", "## 決まったこと", "", "## 次の行動", ""].join(
        "\n"
      )
    }
  },
  {
    name: "asset-bundle",
    title: "素材つきスキル",
    files: {
      "SKILL.md": [
        "# 素材つきスキル",
        "",
        "バイナリの素材を同梱する例。プレビューはテキストだけを返す。",
        ""
      ].join("\n"),
      "assets/sample.bin": Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xff])
    }
  }
];

export type SeedLocalDeps = {
  db: SkillDb;
  bucket: R2Bucket;
};

export type SeedLocalOutcome = {
  seeded: string[];
  skipped: string[];
};

/** 種データを D1・R2 に入れる。既に同じ名前があれば飛ばす。 */
export async function seedLocalSkills({ db, bucket }: SeedLocalDeps): Promise<SeedLocalOutcome> {
  const existing = new Set(
    (await db.select({ name: skills.name }).from(skills).all()).map((row) => row.name)
  );
  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const skill of SEED_SKILLS) {
    if (existing.has(skill.name)) {
      skipped.push(skill.name);
      continue;
    }
    await seedSkill(db, bucket, skill);
    seeded.push(skill.name);
  }

  return { seeded, skipped };
}

function applyMigrations(): boolean {
  const result = Bun.spawnSync({
    cmd: ["bun", "x", "wrangler", "d1", "migrations", "apply", "hikidashi", "--local"],
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit"
  });
  return result.exitCode === 0;
}

async function main(): Promise<void> {
  if (!applyMigrations()) {
    console.error("D1 のマイグレーションを適用できませんでした");
    process.exitCode = 1;
    return;
  }

  const { getPlatformProxy } = await import("wrangler");
  const platform = await getPlatformProxy<{ DB: D1Database; SKILLS: R2Bucket }>({
    remoteBindings: false
  });

  try {
    const outcome = await seedLocalSkills({
      db: createDb(platform.env.DB),
      bucket: platform.env.SKILLS
    });
    if (outcome.seeded.length > 0) console.log(`入れたスキル: ${outcome.seeded.join(", ")}`);
    if (outcome.skipped.length > 0) console.log(`既にあったスキル: ${outcome.skipped.join(", ")}`);
  } finally {
    await platform.dispose();
  }
}

if (import.meta.main) await main();

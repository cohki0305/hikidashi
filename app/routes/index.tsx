import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SkillCard } from "@/app/components/skills/skill-card";
import { SkillSearch } from "@/app/components/skills/skill-search";
import { PageShell } from "@/app/components/ui/page-shell";
import { useMe } from "@/app/hooks/use-me";
import { useSkills } from "@/app/hooks/use-skills";

const mutedStyle = { margin: 0, fontSize: 14, color: "var(--color-text-muted)" } as const;

/** スキル一覧の画面。取得した一覧を手元で絞り込む。 */
export function IndexPage() {
  const [query, setQuery] = useState("");
  const me = useMe();
  const skills = useSkills("");
  const email = me.data?.ok ? me.data.value.email : undefined;

  const all = skills.data?.ok ? skills.data.value.skills : [];
  const q = query.trim();
  const shown = q ? all.filter((s) => (s.title + s.description).includes(q)) : all;
  const countLabel = q ? `「${q}」で ${shown.length} 件` : `${all.length} 件`;
  const failed = skills.data?.ok === false;
  const loading = skills.isPending;

  return (
    <PageShell current="skills" email={email}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>チームのスキル</h1>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            追加するときは、Claude に「このスキルをチームに公開して」と頼みます。
          </p>
        </div>
        <SkillSearch value={query} onChange={setQuery} />
      </div>

      {loading ? <p style={mutedStyle}>読み込み中です…</p> : null}
      {failed ? <p style={mutedStyle}>スキルを読み込めませんでした。</p> : null}
      {!loading && !failed ? <p style={mutedStyle}>{countLabel}</p> : null}

      {!loading && !failed && shown.length === 0 ? (
        <p style={{ ...mutedStyle, fontSize: 15 }}>見つかるスキルはありません。</p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16
        }}
      >
        {shown.map((skill) => (
          <SkillCard key={skill.name} skill={skill} />
        ))}
      </div>
    </PageShell>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "チームのスキル" }] }),
  component: IndexPage
});

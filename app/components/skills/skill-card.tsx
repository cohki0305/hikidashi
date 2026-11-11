import type { SkillSummary } from "@/shared/schemas/skills";

/** 日本時間の「M月D日」にする。 */
function formatDate(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

/** 一覧に並ぶスキル 1 件分のカード。詳細へのリンクになる。 */
export function SkillCard({ skill }: { skill: SkillSummary }) {
  return (
    <a
      href={`/skills/${skill.name}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--color-text)",
        minHeight: 168,
        boxSizing: "border-box"
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}
      >
        <span style={{ fontSize: 17, fontWeight: 700 }}>{skill.title}</span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          {`第${skill.latestVersion}版`}
        </span>
      </div>
      <p style={{ margin: 0, color: "var(--color-text-sub)", lineHeight: 1.6, flexGrow: 1 }}>
        {skill.description}
      </p>
      {skill.claudeCodeOnly ? (
        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-primary)",
            border: "1px solid var(--color-primary)",
            borderRadius: 999,
            padding: "2px 10px"
          }}
        >
          Claude Code 専用
        </span>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}
      >
        <span>{skill.author}</span>
        <span>{formatDate(skill.updatedAt)}</span>
      </div>
    </a>
  );
}

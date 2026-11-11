import type { SkillVersion } from "@/shared/schemas/skills";

/** 日本時間の「M月D日」にする。 */
export function formatDate(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

/** 版の履歴。渡された順（新しい順）にそのまま並べる。 */
export function VersionHistory({ versions }: { versions: SkillVersion[] }) {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>これまでの版</h2>
      {versions.map((v) => (
        <div
          key={v.version}
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 0",
            borderTop: "1px solid var(--color-border)",
            flexWrap: "wrap"
          }}
        >
          <span data-version style={{ width: 56, fontWeight: 600 }}>{`第${v.version}版`}</span>
          <span style={{ width: 96, color: "var(--color-text-muted)" }}>
            {formatDate(v.createdAt)}
          </span>
          <span style={{ flex: "1 1 240px", color: "var(--color-text-sub)" }}>{v.note}</span>
        </div>
      ))}
    </section>
  );
}

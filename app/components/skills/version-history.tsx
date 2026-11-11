import { formatDate } from "@/app/lib/utils";
import type { SkillVersion } from "@/shared/schemas/skills";

/** 版の履歴。新しい順（版番号の降順）に並べる。 */
export function VersionHistory({ versions }: { versions: SkillVersion[] }) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
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
      {sorted.map((v) => (
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

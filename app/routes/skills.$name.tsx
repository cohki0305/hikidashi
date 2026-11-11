import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilePreview } from "@/app/components/skills/file-preview";
import { FileTree } from "@/app/components/skills/file-tree";
import { InstallPanel } from "@/app/components/skills/install-panel";
import { formatDate, VersionHistory } from "@/app/components/skills/version-history";
import { PageShell } from "@/app/components/ui/page-shell";
import { useMe } from "@/app/hooks/use-me";
import { useSkill } from "@/app/hooks/use-skill";

const mutedStyle = { margin: 0, fontSize: 14, color: "var(--color-text-muted)" } as const;

const backLink = (
  <a href="/" style={{ fontSize: 14, color: "var(--color-primary)", textDecoration: "none" }}>
    ← スキル一覧
  </a>
);

/** スキル 1 件の詳細の画面。左にファイルと版の履歴、右に「手元に入れる」を出す。 */
export function SkillDetailPage({ name }: { name: string }) {
  const me = useMe();
  const skill = useSkill(name);
  const [picked, setPicked] = useState<string | null>(null);
  const email = me.data?.ok ? me.data.value.email : undefined;
  const result = skill.data;

  if (!result) {
    return (
      <PageShell current="skills" email={email}>
        {backLink}
        <p style={mutedStyle}>読み込み中です…</p>
      </PageShell>
    );
  }
  if (!result.ok) {
    return (
      <PageShell current="skills" email={email}>
        {backLink}
        <p style={{ ...mutedStyle, fontSize: 15 }}>
          {result.kind === "not_found"
            ? "このスキルは見つかりません"
            : "スキルを読み込めませんでした。"}
        </p>
      </PageShell>
    );
  }

  const { skill: info, files, versions } = result.value;
  const selectedPath =
    picked ??
    (files.find((f) => f.path === "SKILL.md") ?? files.find((f) => f.isText) ?? files[0])?.path ??
    null;
  const selected = files.find((f) => f.path === selectedPath) ?? null;

  return (
    <PageShell current="skills" email={email}>
      {backLink}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>{info.title}</h1>
        <p style={{ margin: 0, color: "var(--color-text-sub)", lineHeight: 1.7 }}>
          {info.description}
        </p>
        <p style={mutedStyle}>
          {`${info.author} ・ 第${info.latestVersion}版 ・ ${formatDate(info.updatedAt)}に更新`}
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div
          style={{
            flex: "999 1 560px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 24
          }}
        >
          <section
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              overflow: "hidden"
            }}
          >
            <FileTree files={files} selected={selectedPath} onSelect={setPicked} />
            <div style={{ borderTop: "1px solid var(--color-border)" }}>
              <FilePreview name={info.name} version={info.latestVersion} file={selected} />
            </div>
          </section>
          <VersionHistory versions={versions} />
        </div>
        <InstallPanel
          name={info.name}
          title={info.title}
          version={info.latestVersion}
          claudeCodeOnly={info.claudeCodeOnly}
        />
      </div>
    </PageShell>
  );
}

function SkillDetailRoute() {
  const { name } = Route.useParams();
  return <SkillDetailPage name={name} />;
}

export const Route = createFileRoute("/skills/$name")({
  head: () => ({ meta: [{ title: "スキルの詳細" }] }),
  component: SkillDetailRoute
});

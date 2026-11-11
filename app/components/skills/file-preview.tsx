import type { Result } from "@/server/lib/result";
import type { SkillFile } from "@/shared/schemas/skills";
import { formatSize } from "./file-tree";

type FilePreviewProps = {
  file: SkillFile | null;
  content: Result<string> | undefined;
  isPending: boolean;
};

const noteStyle = { margin: 0, padding: 24, color: "var(--color-text-muted)" } as const;

/** 選んだファイルの中身。テキストだけ本文を出し、それ以外は名前とサイズだけ出す。 */
export function FilePreview({ file, content, isPending }: FilePreviewProps) {
  if (!file) return null;
  if (!file.isText) {
    return (
      <div style={{ ...noteStyle, display: "flex", flexDirection: "column", gap: 4 }}>
        <span>プレビューできないファイルです</span>
        <span style={{ fontSize: 13 }}>{formatSize(file.sizeBytes)}</span>
      </div>
    );
  }
  if (isPending) return <p style={noteStyle}>読み込み中です…</p>;
  if (!content?.ok) {
    return <p style={noteStyle}>中身を読み込めませんでした。</p>;
  }
  return (
    <pre
      style={{
        margin: 0,
        padding: 24,
        fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.7,
        color: "var(--color-text)",
        whiteSpace: "pre-wrap",
        overflowX: "auto"
      }}
    >
      {content.value}
    </pre>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { SkillFile } from "@/shared/schemas/skills";
import { formatSize } from "./file-tree";

type FilePreviewProps = {
  name: string;
  version: number;
  file: SkillFile | null;
};

const noteStyle = { margin: 0, padding: 24, color: "var(--color-text-muted)" } as const;

// 本文はテキストで返るので、JSON 用の窓口ではなく fetch で直接取る。
async function fetchText(name: string, version: number, path: string): Promise<string | null> {
  try {
    const url = `/api/skills/${encodeURIComponent(name)}/versions/${version}/files?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function TextBody({ name, version, path }: { name: string; version: number; path: string }) {
  const body = useQuery({
    queryKey: ["skill-file", name, version, path],
    queryFn: () => fetchText(name, version, path)
  });
  if (body.isPending) return <p style={noteStyle}>読み込み中です…</p>;
  if (body.data === null || body.data === undefined) {
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
      {body.data}
    </pre>
  );
}

/** 選んだファイルの中身。テキストだけ取りに行き、それ以外は名前とサイズだけ出す。 */
export function FilePreview({ name, version, file }: FilePreviewProps) {
  if (!file) return null;
  if (!file.isText) {
    return (
      <div style={{ ...noteStyle, display: "flex", flexDirection: "column", gap: 4 }}>
        <span>プレビューできないファイルです</span>
        <span style={{ fontSize: 13 }}>{formatSize(file.sizeBytes)}</span>
      </div>
    );
  }
  return <TextBody name={name} version={version} path={file.path} />;
}

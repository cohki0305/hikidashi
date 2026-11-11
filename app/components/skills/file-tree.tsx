import type { SkillFile } from "@/shared/schemas/skills";

/** バイト数を B・KB・MB で書く。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (bytes < 1024 * 1024) return `${trim(bytes / 1024)} KB`;
  return `${trim(bytes / (1024 * 1024))} MB`;
}

type TreeNode = { folders: Map<string, TreeNode>; files: SkillFile[] };

function buildTree(files: SkillFile[]): TreeNode {
  const root: TreeNode = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      let next = node.folders.get(dir);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(dir, next);
      }
      node = next;
    }
    node.files.push(file);
  }
  return root;
}

type FileTreeProps = {
  files: SkillFile[];
  selected: string | null;
  onSelect: (path: string) => void;
};

function Branch({ node, selected, onSelect }: { node: TreeNode } & Omit<FileTreeProps, "files">) {
  return (
    <>
      {[...node.folders.entries()].map(([dir, child]) => (
        <li key={`dir:${dir}`} style={{ listStyle: "none" }}>
          <div style={{ padding: "6px 0", fontWeight: 600, color: "var(--color-text-sub)" }}>
            {dir}
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            <Branch node={child} selected={selected} onSelect={onSelect} />
          </ul>
        </li>
      ))}
      {node.files.map((file) => {
        const active = file.path === selected;
        return (
          <li key={file.path} style={{ listStyle: "none" }}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(file.path)}
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
                gap: 12,
                minHeight: 40,
                alignItems: "center",
                padding: "0 8px",
                border: 0,
                borderRadius: 6,
                background: active ? "var(--color-bg)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-text-sub)",
                fontWeight: active ? 600 : 400,
                fontFamily: "inherit",
                fontSize: 13,
                textAlign: "left",
                cursor: "pointer"
              }}
            >
              <span>{file.path.split("/").pop()}</span>
              <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                {formatSize(file.sizeBytes)}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}

/** ファイルをフォルダの木で並べる。名前の横にサイズを添える。 */
export function FileTree({ files, selected, onSelect }: FileTreeProps) {
  return (
    <ul style={{ margin: 0, padding: 8 }}>
      <Branch node={buildTree(files)} selected={selected} onSelect={onSelect} />
    </ul>
  );
}

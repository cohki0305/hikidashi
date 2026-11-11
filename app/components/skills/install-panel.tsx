import { useState } from "react";

type InstallPanelProps = {
  name: string;
  title: string;
  version: number;
  claudeCodeOnly: boolean;
};

type Tab = "code" | "web";

const textStyle = { margin: 0, color: "var(--color-text-sub)", lineHeight: 1.7 } as const;

function segmentStyle(on: boolean) {
  return {
    minHeight: 40,
    border: 0,
    borderRadius: 6,
    background: on ? "var(--color-surface)" : "transparent",
    color: on ? "var(--color-text)" : "var(--color-text-muted)",
    fontWeight: on ? 600 : 400,
    fontFamily: "inherit",
    fontSize: 14,
    cursor: "pointer",
    outline: on ? "1px solid var(--color-border)" : undefined
  } as const;
}

/** 「手元に入れる」の欄。Claude Code と claude.ai の入れ方を切り替えて見せる。 */
export function InstallPanel({ name, title, version, claudeCodeOnly }: InstallPanelProps) {
  const [tab, setTab] = useState<Tab>("code");
  const [copied, setCopied] = useState(false);
  const request = `チームのスキル「${title}」を入れて`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside
      style={{
        flex: "1 1 320px",
        minWidth: 0,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>手元に入れる</h2>
      <div
        role="tablist"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 4,
          background: "var(--color-bg)",
          borderRadius: 8,
          padding: 4
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "code"}
          onClick={() => setTab("code")}
          style={segmentStyle(tab === "code")}
        >
          Claude Code
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "web"}
          onClick={() => setTab("web")}
          style={segmentStyle(tab === "web")}
        >
          claude.ai
        </button>
      </div>

      {tab === "code" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={textStyle}>Claude にこう頼みます。</p>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <code
              style={{
                flex: 1,
                padding: "12px 14px",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.6
              }}
            >
              {request}
            </code>
            <button
              type="button"
              onClick={copy}
              style={{
                minWidth: 72,
                minHeight: 44,
                border: "1px solid var(--color-border-input)",
                background: "var(--color-surface)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 14,
                color: "var(--color-text)",
                cursor: "pointer"
              }}
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      ) : claudeCodeOnly ? (
        <p style={textStyle}>このスキルは大きいため Claude Code でだけ使えます</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a
            href={`/api/skills/${encodeURIComponent(name)}/versions/${version}/download`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              background: "var(--color-primary)",
              color: "var(--color-surface)",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none"
            }}
          >
            zip をダウンロード
          </a>
          <p style={textStyle}>
            {`claude.ai の「設定 › 機能 › スキル」からアップロードします。Claude に「チームのスキル『${title}』を入れて」と頼んでも、同じ zip を渡してくれます。`}
          </p>
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: 16,
          fontSize: 14,
          color: "var(--color-text-muted)",
          lineHeight: 1.7
        }}
      >
        新しい版が出ると、次に Claude を開いたときに知らせます。
      </div>
    </aside>
  );
}

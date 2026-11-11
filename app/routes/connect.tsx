import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/app/components/ui/page-shell";
import { useMe } from "@/app/hooks/use-me";

const cardStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 24,
  display: "flex",
  flexDirection: "column"
} as const;

const h2Style = { margin: 0, fontSize: 17, fontWeight: 700 } as const;

const STEPS = [
  "claude.ai を開き、「設定 › コネクタ」で「カスタムコネクタを追加」を押す",
  "名前に「hikidashi」、URL に上の URL を貼って追加する",
  "「連携」を押し、いつもの Google アカウントでログインする"
];

const EXAMPLES = [
  { label: "使う", text: "チームのスキル「議事録まとめ」を入れて" },
  { label: "探す", text: "チームに提案書向けのスキルはある？" },
  { label: "公開する", text: "このスキルをチームに公開して" }
];

/** Claude とつなぐ方法の画面。コネクタの URL・手順・頼み方の例を出す。 */
export function ConnectPage() {
  const me = useMe();
  const [copied, setCopied] = useState(false);
  const email = me.data?.ok ? me.data.value.email : undefined;
  const url = `${location.origin}/mcp`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <PageShell current="connect" email={email}>
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Claude とつなぐ</h1>

        <section style={{ ...cardStyle, gap: 12 }}>
          <label htmlFor="connector-url" style={{ fontWeight: 600 }}>
            コネクタの URL
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="connector-url"
              readOnly
              value={url}
              style={{
                flex: "1 1 280px",
                minHeight: 44,
                boxSizing: "border-box",
                padding: "0 14px",
                border: "1px solid var(--color-border-input)",
                borderRadius: 8,
                fontSize: 15,
                fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
                color: "var(--color-text)",
                background: "var(--color-bg)"
              }}
            />
            <button
              type="button"
              onClick={copy}
              style={{
                minWidth: 88,
                minHeight: 44,
                border: 0,
                background: "var(--color-primary)",
                color: "var(--color-surface)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </section>

        <section style={{ ...cardStyle, gap: 16 }}>
          <h2 style={h2Style}>つなぎ方（最初の 1 回だけ）</h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: 22,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              lineHeight: 1.7,
              color: "var(--color-text-sub)"
            }}
          >
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--color-text-muted)",
              lineHeight: 1.7
            }}
          >
            claude.ai でつなげば、同じアカウントの Claude Code からも使えます。
          </p>
        </section>

        <section style={{ ...cardStyle, gap: 16 }}>
          <h2 style={h2Style}>Claude への頼み方</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12
            }}
          >
            {EXAMPLES.map((ex) => (
              <div
                key={ex.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 16,
                  background: "var(--color-bg)",
                  borderRadius: 8
                }}
              >
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{ex.label}</span>
                <span style={{ lineHeight: 1.6 }}>{ex.text}</span>
                {ex.label === "公開する" && (
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                    公開は Claude Code からだけできます
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export const Route = createFileRoute("/connect")({
  head: () => ({ meta: [{ title: "つなぎ方" }] }),
  component: ConnectPage
});

import { Link } from "@tanstack/react-router";

export type NavKey = "skills" | "connect" | "members";

type AppHeaderProps = {
  current: NavKey;
  email?: string;
};

const NAV_ITEMS: { key: NavKey; href: "/" | "/connect" | "/members"; label: string }[] = [
  { key: "skills", href: "/", label: "スキル" },
  { key: "connect", href: "/connect", label: "つなぎ方" },
  { key: "members", href: "/members", label: "メンバー" }
];

// 「つなぎ方」の画面のルートはまだ無いので、ナビは通常のリンクにしている。
/** 画面の上に並ぶ帯。ロゴ・ナビ・ログイン中のメールを出す。 */
export function AppHeader({ current, email }: AppHeaderProps) {
  return (
    <header
      style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 24
        }}
      >
        <Link
          to="/"
          style={{
            fontWeight: 700,
            fontSize: 18,
            color: "var(--color-text)",
            textDecoration: undefined
          }}
        >
          hikidashi
        </Link>
        <nav style={{ display: "flex", gap: 24, flexGrow: 1, flexShrink: 0 }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === current;
            return (
              <a
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                style={{
                  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                  fontWeight: active ? 600 : 400,
                  textDecoration: "none",
                  padding: "20px 0",
                  borderBottom: active ? "2px solid var(--color-primary)" : undefined
                }}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        {email ? (
          <span
            title={email}
            style={{
              fontSize: 14,
              color: "var(--color-text-muted)",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {email}
          </span>
        ) : null}
      </div>
    </header>
  );
}

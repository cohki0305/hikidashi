import type { ReactNode } from "react";
import { AppHeader, type NavKey } from "./app-header";

type PageShellProps = {
  current: NavKey;
  email?: string;
  children: ReactNode;
};

/** ヘッダーと、中央寄せの本文をまとめた画面の枠。 */
export function PageShell({ current, email, children }: PageShellProps) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <AppHeader current={current} email={email} />
      <main
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "40px 24px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 24
        }}
      >
        {children}
      </main>
    </div>
  );
}

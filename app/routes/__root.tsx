import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { useMe } from "@/app/hooks/use-me";

/** メンバーでない人に、どの画面でも出す案内。 */
function NotMemberNotice() {
  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 460,
          boxSizing: "border-box",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>招待リンクが必要です</h1>
        <p role="alert" style={{ margin: 0, lineHeight: 1.7 }}>
          hikidashi に入るには招待リンクが要ります。メンバーの人にリンクをもらって開いてください。
        </p>
      </section>
    </div>
  );
}

/** すべての画面を包む枠。画面ごとの題名と、選ばれた画面を出す。メンバーでなければ案内を出す。 */
export function RootComponent() {
  const me = useMe();
  const notMember = me.data?.ok === true && !me.data.value.isMember;
  const onJoin = window.location.pathname === "/join";
  return (
    <>
      <HeadContent />
      {notMember && !onJoin ? <NotMemberNotice /> : <Outlet />}
    </>
  );
}

export const Route = createRootRoute({ component: RootComponent });

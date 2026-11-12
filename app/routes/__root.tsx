import { createRootRoute, HeadContent, Outlet, useLocation } from "@tanstack/react-router";
import { useMe } from "@/app/hooks/use-me";

type NoticeProps = {
  title: string;
  message: string;
};

/** 画面の代わりに出す案内。 */
function Notice({ title, message }: NoticeProps) {
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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{title}</h1>
        <p role="alert" style={{ margin: 0, lineHeight: 1.7 }}>
          {message}
        </p>
      </section>
    </div>
  );
}

/** メンバーでない人に、どの画面でも出す案内。 */
function NotMemberNotice() {
  return (
    <Notice
      title="招待リンクが必要です"
      message="hikidashi に入るには招待リンクが要ります。メンバーの人にリンクをもらって開いてください。"
    />
  );
}

/** すべての画面を包む枠。画面ごとの題名と、選ばれた画面を出す。メンバーでなければ案内を出す。 */
export function RootComponent() {
  const me = useMe();
  const location = useLocation();
  const onJoin = location.pathname === "/join";
  const isMember = me.data?.ok === true && me.data.value.isMember;
  return (
    <>
      <HeadContent />
      {onJoin ? (
        <Outlet />
      ) : me.data === undefined ? (
        <Notice title="読み込んでいます" message="少しお待ちください。" />
      ) : me.data.ok === false ? (
        <Notice title="読み込めませんでした" message="時間をおいて画面を開き直してください。" />
      ) : isMember ? (
        <Outlet />
      ) : (
        <NotMemberNotice />
      )}
    </>
  );
}

export const Route = createRootRoute({ component: RootComponent });

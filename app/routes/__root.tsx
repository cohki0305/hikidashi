import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";

/** すべての画面を包む枠。画面ごとの題名と、選ばれた画面を出す。 */
export function RootComponent() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({ component: RootComponent });

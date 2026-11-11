import { createFileRoute } from "@tanstack/react-router";

/** トップの画面。いまはサービスの名前だけを出す。 */
export function IndexPage() {
  return (
    <main className="app-main">
      <h1 className="app-title">hikidashi</h1>
    </main>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "hikidashi" }] }),
  component: IndexPage
});

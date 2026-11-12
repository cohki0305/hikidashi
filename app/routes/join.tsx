import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { redeemInviteResponseSchema } from "@/shared/schemas/members";

const INVALID_MESSAGE = "このリンクは使えません。招待した人に新しいリンクをもらってください。";
const FAILED_MESSAGE = "うまくいきませんでした。時間をおいて開き直してください。";

type Outcome = "joined" | "invalid" | "failed";

async function redeem(key: string): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch("/api/invites/redemptions", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ key })
    });
  } catch {
    return "failed";
  }
  if (response.status >= 500) return "failed";
  if (!response.ok) return "invalid";
  try {
    return redeemInviteResponseSchema.safeParse(await response.json()).success
      ? "joined"
      : "failed";
  } catch {
    return "failed";
  }
}

// 毎回同じ関数にして、画面の描き直しで確認をやり直さないようにする。
function defaultNavigate(url: string) {
  window.location.assign(url);
}

type JoinPageProps = {
  /** 画面を移す。テストでは差し替える。 */
  navigateTo?: (url: string) => void;
};

/** 招待リンクを開いた人がメンバーになる画面。 */
export function JoinPage({ navigateTo = defaultNavigate }: JoinPageProps = {}) {
  const key = new URLSearchParams(window.location.search).get("key") ?? "";
  const [message, setMessage] = useState<string | null>(key ? null : INVALID_MESSAGE);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    redeem(key).then((outcome) => {
      if (cancelled) return;
      if (outcome === "joined") navigateTo("/members");
      else setMessage(outcome === "invalid" ? INVALID_MESSAGE : FAILED_MESSAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [key, navigateTo]);

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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>hikidashi に入る</h1>
        <p role={message ? "alert" : "status"} style={{ margin: 0, lineHeight: 1.7 }}>
          {message ?? "招待リンクを確かめています…"}
        </p>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/join")({
  head: () => ({ meta: [{ title: "招待リンクで入る" }] }),
  component: JoinPage
});

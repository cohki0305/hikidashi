import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type OAuthRequestResponse,
  oauthRedirectResponseSchema,
  oauthRequestResponseSchema
} from "@/shared/schemas/oauth-requests";

const EXPIRED_MESSAGE = "この画面は期限が切れました。Claude の画面からもう一度つないでください。";
const FAILED_MESSAGE = "うまくいきませんでした。時間をおいて開き直してください。";

const cardStyle = {
  width: "100%",
  maxWidth: 460,
  boxSizing: "border-box",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 18
} as const;

async function readRequest(id: string) {
  const response = await fetch(`/api/oauth-requests/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" }
  });
  if (response.status === 404 || response.status === 409) return { kind: "expired" } as const;
  if (!response.ok) return { kind: "failed" } as const;
  const parsed = oauthRequestResponseSchema.safeParse(await response.json());
  if (!parsed.success) return { kind: "failed" } as const;
  return parsed.data.status === "expired"
    ? ({ kind: "expired" } as const)
    : ({ kind: "ready", view: parsed.data } as const);
}

async function readRedirect(id: string, action: "approvals" | "denials") {
  const response = await fetch(`/api/oauth-requests/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: { accept: "application/json" }
  });
  if (response.status === 404 || response.status === 409) return { kind: "expired" } as const;
  if (!response.ok) return { kind: "failed" } as const;
  const parsed = oauthRedirectResponseSchema.safeParse(await response.json());
  return parsed.success
    ? ({ kind: "moved", redirectTo: parsed.data.redirectTo } as const)
    : ({ kind: "failed" } as const);
}

type AuthorizePageProps = {
  /** 戻り先へ移る。テストでは差し替える。 */
  navigateTo?: (url: string) => void;
};

/** Claude がチームのスキルを探して入れられるようにしてよいかを答える画面。 */
export function AuthorizePage({
  navigateTo = (url) => window.location.assign(url)
}: AuthorizePageProps = {}) {
  const requestId = new URLSearchParams(window.location.search).get("request") ?? "";
  const [view, setView] = useState<OAuthRequestResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!requestId) {
      setMessage(EXPIRED_MESSAGE);
      return;
    }
    readRequest(requestId)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "expired") setMessage(EXPIRED_MESSAGE);
        else if (result.kind === "failed") setMessage(FAILED_MESSAGE);
        else setView(result.view);
      })
      .catch(() => {
        if (!cancelled) setMessage(FAILED_MESSAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const send = async (action: "approvals" | "denials") => {
    setSending(true);
    try {
      const result = await readRedirect(requestId, action);
      if (result.kind === "moved") navigateTo(result.redirectTo);
      else setMessage(result.kind === "expired" ? EXPIRED_MESSAGE : FAILED_MESSAGE);
    } catch {
      setMessage(FAILED_MESSAGE);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "var(--color-bg)",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <main style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)" }}>hikidashi</div>
        {view ? (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-text)",
                lineHeight: 1.5
              }}
            >
              Claude を hikidashi につなぎます
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--color-text-sub)"
              }}
            >
              {`${view.clientName} がチームのスキルを探し、入れられるようになります。`}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                disabled={sending}
                onClick={() => send("approvals")}
                style={{
                  flex: 1,
                  minHeight: 44,
                  border: 0,
                  borderRadius: 8,
                  background: "var(--color-primary)",
                  color: "var(--color-surface)",
                  fontFamily: "inherit",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.6 : 1
                }}
              >
                つなぐ
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => send("denials")}
                style={{
                  minWidth: 88,
                  minHeight: 44,
                  border: "1px solid var(--color-border-input)",
                  borderRadius: 8,
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "inherit",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.6 : 1
                }}
              >
                やめる
              </button>
            </div>
          </>
        ) : null}
        {!view && !message ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>
            読み込み中です…
          </p>
        ) : null}
        {message ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--color-text-sub)" }}
          >
            {message}
          </p>
        ) : null}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/authorize")({
  head: () => ({ meta: [{ title: "Claude とつなぐ" }] }),
  component: AuthorizePage
});

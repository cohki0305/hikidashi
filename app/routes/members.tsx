import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/app/components/ui/page-shell";
import { useMe } from "@/app/hooks/use-me";
import { getJson, sendRequest } from "@/app/lib/api";
import {
  type CreatedInvite,
  createdInviteSchema,
  invitesResponseSchema,
  membersResponseSchema
} from "@/shared/schemas/members";

const cardStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12
} as const;

const h2Style = { margin: 0, fontSize: 17, fontWeight: 700 } as const;
const mutedStyle = { margin: 0, fontSize: 14, color: "var(--color-text-muted)" } as const;
const primaryButton = {
  minHeight: 44,
  padding: "0 20px",
  border: 0,
  background: "var(--color-primary)",
  color: "var(--color-surface)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer"
} as const;
const subButton = {
  minHeight: 36,
  padding: "0 14px",
  border: "1px solid var(--color-border-input)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 14,
  cursor: "pointer"
} as const;
const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 0",
  borderTop: "1px solid var(--color-border)"
} as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

async function send(method: "POST" | "DELETE", path: string): Promise<Response | null> {
  const result = await sendRequest(method, path);
  return result.ok ? result.value : null;
}

/** 招待リンクを作る・止める、メンバーを見る・外す画面。 */
export function MembersPage() {
  const queryClient = useQueryClient();
  const me = useMe();
  const email = me.data?.ok ? me.data.value.email : undefined;
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => getJson("/api/members", membersResponseSchema)
  });
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: () => getJson("/api/invites", invitesResponseSchema)
  });
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const response = await send("POST", "/api/invites");
      if (!response) return null;
      const parsed = createdInviteSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    },
    onSuccess: (invite) => {
      if (!invite) {
        setError("リンクを作れませんでした。時間をおいてもう一度お試しください。");
        return;
      }
      setError(null);
      setCopied(false);
      setCreated(invite);
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    }
  });

  const revoke = useMutation({
    mutationFn: (id: string) => send("DELETE", `/api/invites/${encodeURIComponent(id)}`),
    onSuccess: (response) => {
      setError(response ? null : "リンクを止められませんでした。もう一度お試しください。");
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    }
  });

  const remove = useMutation({
    mutationFn: (target: string) => send("DELETE", `/api/members/${encodeURIComponent(target)}`),
    onSuccess: (response) => {
      setConfirming(null);
      setError(response ? null : "外せませんでした。もう一度お試しください。");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    }
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const memberList = members.data?.ok ? members.data.value.members : [];
  const inviteList = invites.data?.ok ? invites.data.value.invites : [];

  return (
    <PageShell current="members" email={email}>
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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>メンバー</h1>
        {error ? (
          <p role="alert" style={{ margin: 0, color: "var(--color-danger, #b3261e)" }}>
            {error}
          </p>
        ) : null}

        <section style={cardStyle}>
          <h2 style={h2Style}>招待する</h2>
          <div>
            <button
              type="button"
              style={primaryButton}
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              招待リンクを作る
            </button>
          </div>
          {created ? (
            <>
              <label htmlFor="invite-url" style={{ fontWeight: 600 }}>
                招待リンク
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="invite-url"
                  readOnly
                  value={created.url}
                  style={{
                    flex: "1 1 280px",
                    minHeight: 44,
                    boxSizing: "border-box",
                    padding: "0 14px",
                    border: "1px solid var(--color-border-input)",
                    borderRadius: 8,
                    fontSize: 15,
                    color: "var(--color-text)",
                    background: "var(--color-bg)"
                  }}
                />
                <button type="button" onClick={copy} style={{ ...primaryButton, minWidth: 88 }}>
                  {copied ? "コピー済み" : "コピー"}
                </button>
              </div>
              <p style={mutedStyle}>
                7 日間、何人でも使えます。この画面を離れると、もう一度は表示できません。
              </p>
            </>
          ) : null}
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>自分が作ったリンク</h2>
          {invites.isLoading ? <p style={mutedStyle}>読み込んでいます…</p> : null}
          {invites.data?.ok === false ? <p style={mutedStyle}>読み込めませんでした。</p> : null}
          {invites.data?.ok && inviteList.length === 0 ? (
            <p style={mutedStyle}>自分が作ったリンクはありません。</p>
          ) : null}
          {inviteList.map((invite) => (
            <div key={invite.id} style={rowStyle}>
              <span style={{ fontSize: 14 }}>
                {formatDate(invite.createdAt)}に作成 ・ {formatDate(invite.expiresAt)}まで
              </span>
              <button
                type="button"
                style={subButton}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invite.id)}
              >
                止める
              </button>
            </div>
          ))}
          <p style={mutedStyle}>止めても、そのリンクで入った人はそのままです。</p>
          <p style={mutedStyle}>メンバーを外すと、その人が作ったリンクも止まります。</p>
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>メンバー</h2>
          {members.isLoading ? <p style={mutedStyle}>読み込んでいます…</p> : null}
          {members.data?.ok === false ? <p style={mutedStyle}>読み込めませんでした。</p> : null}
          {memberList.map((member) => (
            <div key={member.email} style={rowStyle}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{member.email}</span>
              <span style={{ ...mutedStyle, flexGrow: 1 }}>
                {formatDate(member.joinedAt)}に参加
              </span>
              {member.isOwner || member.isMe ? null : (
                <button type="button" style={subButton} onClick={() => setConfirming(member.email)}>
                  外す
                </button>
              )}
              {confirming === member.email ? (
                <div
                  role="alertdialog"
                  aria-label="外す確認"
                  style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <p style={{ margin: 0 }}>
                    {member.email} を外しますか？ Claude からも使えなくなります。
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={primaryButton}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(member.email)}
                    >
                      外す
                    </button>
                    <button type="button" style={subButton} onClick={() => setConfirming(null)}>
                      やめる
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  );
}

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "メンバー" }] }),
  component: MembersPage
});

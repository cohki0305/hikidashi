import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { createQueryClient } from "@/app/lib/browser/query-client";

const actualRouter = { ...(await import("@tanstack/react-router")) };

function Link({ children, to, ...rest }: { children: ReactNode; to: string }) {
  return (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}

mock.module("@tanstack/react-router", () => ({ ...actualRouter, Link }));

const { MembersPage } = await import("./members");

const realFetch = globalThis.fetch;
const realClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  if (realClipboard) Object.defineProperty(navigator, "clipboard", realClipboard);
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

type SetupOptions = {
  members?: () => Promise<Response>;
  invites?: () => Promise<Response>;
};

function setup(options: SetupOptions = {}) {
  const state = {
    members: [
      {
        email: "owner@example.test",
        joinedAt: "2026-11-01T00:00:00.000Z",
        isOwner: true,
        isMe: false
      },
      {
        email: "me@example.test",
        joinedAt: "2026-11-02T00:00:00.000Z",
        isOwner: false,
        isMe: true
      },
      {
        email: "hanako@example.test",
        joinedAt: "2026-11-03T00:00:00.000Z",
        isOwner: false,
        isMe: false
      }
    ],
    invites: [
      { id: "iv-1", createdAt: "2026-11-10T00:00:00.000Z", expiresAt: "2026-11-17T00:00:00.000Z" }
    ]
  };
  const calls: { method: string; path: string }[] = [];
  const fn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    calls.push({ method, path });
    if (path === "/api/me") return json({ email: "me@example.test", isMember: true });
    if (path === "/api/members" && method === "GET")
      return options.members ? options.members() : json({ members: state.members });
    if (path === "/api/invites" && method === "GET")
      return options.invites ? options.invites() : json({ invites: state.invites });
    if (path === "/api/invites" && method === "POST")
      return json(
        {
          id: "iv-2",
          url: "https://hikidashi.example.test/join?key=hkd_iv_test",
          expiresAt: "2026-11-19T00:00:00.000Z"
        },
        201
      );
    if (path.startsWith("/api/invites/") && method === "DELETE") {
      state.invites = [];
      return new Response(null, { status: 204 });
    }
    if (path.startsWith("/api/members/") && method === "DELETE") {
      state.members = state.members.filter(
        (m) => decodeURIComponent(path) !== `/api/members/${m.email}`
      );
      return new Response(null, { status: 204 });
    }
    return json({ error: "not_found" }, 404);
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MembersPage />
    </QueryClientProvider>
  );
  return calls;
}

describe("メンバーの画面", () => {
  test("メンバーと自分が作ったリンクが並ぶ", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("hanako@example.test")).toBeTruthy());
    expect(screen.getByText("owner@example.test")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "自分が作ったリンク" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "止める" })).toBeTruthy();
  });

  test("招待リンクを読み込めなかったら、無いとは書かない", async () => {
    setup({ invites: async () => json({ error: "x" }, 500) });
    await waitFor(() => expect(screen.getByText("読み込めませんでした。")).toBeTruthy());
    expect(screen.queryByText("自分が作ったリンクはありません。")).toBeNull();
  });

  test("招待リンクの読み込み中は、無いとは書かない", async () => {
    setup({ invites: () => new Promise<Response>(() => {}) });
    await waitFor(() => expect(screen.getByText("hanako@example.test")).toBeTruthy());
    expect(screen.getByText("読み込んでいます…")).toBeTruthy();
    expect(screen.queryByText("自分が作ったリンクはありません。")).toBeNull();
  });

  test("メンバーの読み込み中は、読み込み中と出す", async () => {
    setup({ members: () => new Promise<Response>(() => {}) });
    await waitFor(() => expect(screen.getByRole("button", { name: "止める" })).toBeTruthy());
    expect(screen.getByText("読み込んでいます…")).toBeTruthy();
    expect(screen.queryByText("hanako@example.test")).toBeNull();
  });

  test("最初のメンバーと自分には「外す」が出ない", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("hanako@example.test")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "外す" }).length).toBe(1);
  });

  test("リンクを作ると読み取り専用の欄に出て、コピーできる", async () => {
    const writeText = mock(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const calls = setup();
    fireEvent.click(await screen.findByRole("button", { name: "招待リンクを作る" }));
    const input = (await screen.findByLabelText("招待リンク")) as HTMLInputElement;
    expect(input.value).toBe("https://hikidashi.example.test/join?key=hkd_iv_test");
    expect(input.readOnly).toBe(true);
    expect(
      screen.getByText("7 日間、何人でも使えます。この画面を離れると、もう一度は表示できません。")
    ).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/invites")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "コピー済み" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("https://hikidashi.example.test/join?key=hkd_iv_test");
  });

  test("止めるとリンクが一覧から消える", async () => {
    const calls = setup();
    fireEvent.click(await screen.findByRole("button", { name: "止める" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "止める" })).toBeNull());
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/invites/iv-1")).toBe(true);
  });

  test("外すときは確認を挟み、やめると何も起きない", async () => {
    const calls = setup();
    fireEvent.click(await screen.findByRole("button", { name: "外す" }));
    expect(
      screen.getByText("hanako@example.test を外しますか？ Claude からも使えなくなります。")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByText(/を外しますか/)).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("確認で「外す」を押すとメンバーから消える", async () => {
    const calls = setup();
    fireEvent.click(await screen.findByRole("button", { name: "外す" }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "外す" }));
    await waitFor(() => expect(screen.queryByText("hanako@example.test")).toBeNull());
    expect(
      calls.some((c) => c.method === "DELETE" && c.path === "/api/members/hanako%40example.test")
    ).toBe(true);
  });
});

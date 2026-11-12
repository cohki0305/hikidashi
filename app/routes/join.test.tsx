import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { JoinPage } = await import("./join");

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  window.history.replaceState(null, "", "/");
});

function setFetch(status: number, body: unknown) {
  const fn = mock(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      })
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("招待リンクを使う画面", () => {
  test("鍵を送り、成功したらメンバーの画面へ移る", async () => {
    window.history.replaceState(null, "", "/join?key=hkd_iv_test");
    const fn = setFetch(200, { joined: true });
    const navigateTo = mock((_url: string) => {});
    render(<JoinPage navigateTo={navigateTo} />);
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/"));
    const [url, init] = fn.mock.calls[0] ?? [];
    expect(url).toBe("/api/invites/redemptions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ key: "hkd_iv_test" });
  });

  test("成功したら履歴を置き換えてスキル一覧へ移る", async () => {
    window.history.replaceState(null, "", "/join?key=hkd_iv_test");
    setFetch(200, { joined: true });
    const replace = mock((_url: string | URL) => {});
    Object.defineProperty(window.location, "replace", { value: replace, configurable: true });
    try {
      render(<JoinPage />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    } finally {
      Reflect.deleteProperty(window.location, "replace");
    }
  });

  test("すでにメンバーでも同じく移る", async () => {
    window.history.replaceState(null, "", "/join?key=hkd_iv_test");
    setFetch(200, { joined: false });
    const navigateTo = mock((_url: string) => {});
    render(<JoinPage navigateTo={navigateTo} />);
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/"));
  });

  test("使えないリンクなら理由を分けずに案内を出す", async () => {
    window.history.replaceState(null, "", "/join?key=bad");
    setFetch(404, { error: "not_found" });
    const navigateTo = mock((_url: string) => {});
    render(<JoinPage navigateTo={navigateTo} />);
    await waitFor(() =>
      expect(
        screen.getByText("このリンクは使えません。招待した人に新しいリンクをもらってください。")
      ).toBeTruthy()
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  test("鍵が無いときは送らずに案内を出す", async () => {
    const fn = setFetch(200, { joined: true });
    render(<JoinPage navigateTo={() => {}} />);
    await waitFor(() => expect(screen.getByText(/このリンクは使えません/)).toBeTruthy());
    expect(fn).not.toHaveBeenCalled();
  });
});

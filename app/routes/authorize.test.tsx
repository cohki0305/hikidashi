import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthorizePage } from "./authorize";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const originalFetch = globalThis.fetch;

type Options = { status?: number; statusField?: "pending" | "expired" };

/** 受けた呼び出しを記録し、決まった応答を返す偽の fetch。 */
function stubApi(options: Options = {}) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const method = input instanceof Request ? input.method : (init?.method ?? "GET");
    calls.push(`${method} ${url.pathname}`);
    if (method === "GET") {
      if (options.status && options.status !== 200)
        return Response.json({ error: "Not found" }, { status: options.status });
      return Response.json({ clientName: "Claude", status: options.statusField ?? "pending" });
    }
    return Response.json({
      redirectTo: url.pathname.endsWith("/denials")
        ? "https://claude.ai/cb?error=access_denied&state=st-1"
        : "https://claude.ai/cb?code=hkd_cd_fake&state=st-1"
    });
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage(navigateTo: (url: string) => void = () => undefined) {
  window.history.replaceState({}, "", `/authorize?request=${REQUEST_ID}`);
  return render(<AuthorizePage navigateTo={navigateTo} />);
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("許可の画面", () => {
  test("つなぐ相手と説明とボタンを出す", async () => {
    stubApi();
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Claude を hikidashi につなぎます" })
    ).toBeTruthy();
    expect(
      screen.getByText("Claude がチームのスキルを探し、入れられるようになります。")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "つなぐ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "やめる" })).toBeTruthy();
  });

  test("「つなぐ」を押すと許可を送り、戻り先へ移る", async () => {
    const calls = stubApi();
    const moved: string[] = [];
    renderPage((url) => moved.push(url));
    fireEvent.click(await screen.findByRole("button", { name: "つなぐ" }));
    await waitFor(() =>
      expect(moved).toEqual(["https://claude.ai/cb?code=hkd_cd_fake&state=st-1"])
    );
    expect(calls).toContain(`POST /api/oauth-requests/${REQUEST_ID}/approvals`);
  });

  test("「やめる」を押すと拒否を送り、戻り先へ移る", async () => {
    const calls = stubApi();
    const moved: string[] = [];
    renderPage((url) => moved.push(url));
    fireEvent.click(await screen.findByRole("button", { name: "やめる" }));
    await waitFor(() =>
      expect(moved).toEqual(["https://claude.ai/cb?error=access_denied&state=st-1"])
    );
    expect(calls).toContain(`POST /api/oauth-requests/${REQUEST_ID}/denials`);
  });

  test("期限切れの頼みは案内だけを出す", async () => {
    stubApi({ status: 404 });
    renderPage();
    expect(
      await screen.findByText(
        "この画面は期限が切れました。Claude の画面からもう一度つないでください。"
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "つなぐ" })).toBeNull();
  });

  test("状態が expired でも同じ案内を出す", async () => {
    stubApi({ statusField: "expired" });
    renderPage();
    expect(
      await screen.findByText(
        "この画面は期限が切れました。Claude の画面からもう一度つないでください。"
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "つなぐ" })).toBeNull();
  });
});

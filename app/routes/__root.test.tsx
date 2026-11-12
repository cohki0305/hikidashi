import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createQueryClient } from "@/app/lib/browser/query-client";

const actualRouter = { ...(await import("@tanstack/react-router")) };

function HeadContent() {
  return null;
}

function Outlet() {
  return <p>画面の中身</p>;
}

mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  createRootRoute: (options: object) => ({ ...options, options }),
  HeadContent,
  Outlet
}));

const { RootComponent, Route } = await import("./__root");

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  window.history.replaceState(null, "", "/");
});

function setMe(isMember: boolean) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ email: "sato@example.test", isMember }), {
      headers: { "content-type": "application/json" }
    })) as unknown as typeof fetch;
}

function renderRoot() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RootComponent />
    </QueryClientProvider>
  );
}

const NOTICE =
  "hikidashi に入るには招待リンクが要ります。メンバーの人にリンクをもらって開いてください。";

describe("ルートの枠", () => {
  test("子の画面を Outlet に流す", () => {
    setMe(true);
    renderRoot();
    expect(screen.getByText("画面の中身")).toBeTruthy();
  });

  test("メンバーでなければ案内を出し、画面の中身は出さない", async () => {
    setMe(false);
    renderRoot();
    await waitFor(() => expect(screen.getByText(NOTICE)).toBeTruthy());
    expect(screen.queryByText("画面の中身")).toBeNull();
  });

  test("メンバーでなくても /join では中身を出す", async () => {
    window.history.replaceState(null, "", "/join?key=x");
    setMe(false);
    renderRoot();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("画面の中身")).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test("枠の component を Route に渡している", () => {
    expect(Route.options.component).toBe(RootComponent);
  });
});

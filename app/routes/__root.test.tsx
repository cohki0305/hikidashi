import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

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

afterEach(cleanup);

describe("ルートの枠", () => {
  test("子の画面を Outlet に流す", () => {
    render(<RootComponent />);
    expect(screen.getByText("画面の中身")).toBeTruthy();
  });

  test("枠の component を Route に渡している", () => {
    expect(Route.options.component).toBe(RootComponent);
  });
});

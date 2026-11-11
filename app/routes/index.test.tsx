import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { IndexPage } from "./index";

afterEach(cleanup);

describe("トップ", () => {
  test("トップに hikidashi と出る", () => {
    render(<IndexPage />);
    expect(screen.getByRole("heading", { name: "hikidashi" })).toBeTruthy();
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillSearch } from "./skill-search";

afterEach(cleanup);

describe("スキルの検索欄", () => {
  test("ラベルと入力済みの文字を出す", () => {
    render(<SkillSearch value="議事録" onChange={() => {}} />);
    const input = screen.getByLabelText("スキルを探す") as HTMLInputElement;
    expect(input.value).toBe("議事録");
    expect(input.placeholder).toBe("名前や説明で探す");
  });

  test("入力のたびに onChange へ文字を渡す", () => {
    const seen: string[] = [];
    render(<SkillSearch value="" onChange={(v) => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText("スキルを探す"), { target: { value: "提案" } });
    expect(seen).toEqual(["提案"]);
  });
});

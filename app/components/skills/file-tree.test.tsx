import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SkillFile } from "@/shared/schemas/skills";
import { FileTree, formatSize } from "./file-tree";

afterEach(cleanup);

const files: SkillFile[] = [
  { path: "SKILL.md", sizeBytes: 600, isText: true },
  { path: "examples/sample.md", sizeBytes: 2048, isText: true },
  { path: "examples/deep/clip.mp4", sizeBytes: 5 * 1024 * 1024, isText: false }
];

describe("ファイルの木", () => {
  test("フォルダの下にファイルが入り、サイズを添える", () => {
    render(<FileTree files={files} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("examples")).toBeTruthy();
    expect(screen.getByText("deep")).toBeTruthy();
    expect(screen.getByRole("button", { name: /SKILL\.md/ })).toBeTruthy();
    expect(screen.getByText("600 B")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    expect(screen.getByText("5 MB")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sample\.md/ })).toBeTruthy();
  });

  test("押したファイルのパスを渡し、選択中は印が付く", () => {
    const onSelect = mock((_path: string) => {});
    render(<FileTree files={files} selected="SKILL.md" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /SKILL\.md/ }).getAttribute("aria-current")).toBe(
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: /sample\.md/ }));
    expect(onSelect).toHaveBeenCalledWith("examples/sample.md");
  });

  test("サイズの書き方", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(95 * 1024 * 1024)).toBe("95 MB");
  });
});

import { describe, expect, test } from "bun:test";
import { findDocsRefsViolations } from "./lint-docs-refs";

const PKG = JSON.stringify({ scripts: { test: "x", "lint:all": "x", dev: "x" } });
const find = (files: Record<string, string>) =>
  findDocsRefsViolations(Object.keys(files), (f) => files[f] ?? "", PKG);

describe("lint:docs-refs", () => {
  test("package.json に無い bun run X を検出する", () => {
    expect(find({ "README.md": "実行: `bun run lint:nothing`\n\n```\nbun run nope\n```" })).toEqual(
      [
        { file: "README.md", line: 1, command: "lint:nothing" },
        { file: "README.md", line: 4, command: "nope" }
      ]
    );
  });

  test("docs 配下と入れ子の CLAUDE.md も見る", () => {
    expect(find({ "docs/a/b.md": "bun run gone", "scripts/CLAUDE.md": "bun run gone2" })).toEqual([
      { file: "docs/a/b.md", line: 1, command: "gone" },
      { file: "scripts/CLAUDE.md", line: 1, command: "gone2" }
    ]);
  });

  test("実在する script とファイルパス指定は通す", () => {
    expect(
      find({
        "README.md":
          "bun run test と bun run lint:all\nbun run dev\nbun run scripts/ops/x.ts\nbun run に続く名前"
      })
    ).toEqual([]);
  });

  test("対象外のファイルは見ない", () => {
    expect(find({ "app/a.md": "bun run gone", "src/README.md.bak": "bun run gone" })).toEqual([]);
  });
});

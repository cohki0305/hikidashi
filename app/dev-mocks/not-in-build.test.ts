import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findLeakedScripts } from "./not-in-build";

const ASSETS = "dist/client/assets";
const NEEDLES = ["動画の字幕入れ", "video-subtitles"];

describe("findLeakedScripts", () => {
  test("禁止の文字列を含む js だけ返す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "leak-"));
    writeFileSync(path.join(dir, "a.js"), "var x='動画の字幕入れ'");
    writeFileSync(path.join(dir, "b.js"), "var y=1");
    expect(findLeakedScripts(dir, NEEDLES)).toEqual(["a.js"]);
  });
});

// 偽の応答は開発のときだけ使う。本番のビルドに文字列が混ざっていないことを確かめる。
describe("偽の応答はビルドに入らない", () => {
  test("ビルド成果物に偽データの文字列が無い", async () => {
    if (!existsSync(ASSETS)) {
      const proc = Bun.spawn(["bun", "run", "build"], { stdout: "pipe", stderr: "pipe" });
      expect(await proc.exited).toBe(0);
    }
    expect(readdirSync(ASSETS).some((f) => f.endsWith(".js"))).toBe(true);
    expect(findLeakedScripts(ASSETS, NEEDLES)).toEqual([]);
  }, 180_000);
});

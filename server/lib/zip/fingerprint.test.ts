import { describe, expect, test } from "bun:test";
import { fingerprintOf } from "./fingerprint";

function expected(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

describe("fingerprintOf", () => {
  test("パスの昇順に並べた path と sha256 の一覧から指紋を作る", async () => {
    const fingerprint = await fingerprintOf([
      { path: "b.md", sha256: "2222" },
      { path: "a.md", sha256: "1111" }
    ]);

    expect(fingerprint).toBe(expected("a.md\t1111\nb.md\t2222\n"));
  });

  test("並び順が違っても同じ指紋になる", async () => {
    const left = await fingerprintOf([
      { path: "a.md", sha256: "1111" },
      { path: "b.md", sha256: "2222" }
    ]);
    const right = await fingerprintOf([
      { path: "b.md", sha256: "2222" },
      { path: "a.md", sha256: "1111" }
    ]);

    expect(left).toBe(right);
  });

  test("中身かパスが変わると指紋が変わる", async () => {
    const base = await fingerprintOf([{ path: "a.md", sha256: "1111" }]);
    const otherContent = await fingerprintOf([{ path: "a.md", sha256: "2222" }]);
    const otherPath = await fingerprintOf([{ path: "b.md", sha256: "1111" }]);

    expect(base).not.toBe(otherContent);
    expect(base).not.toBe(otherPath);
  });

  test("空の一覧でも 64 文字の hex を返す", async () => {
    const fingerprint = await fingerprintOf([]);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).toBe(expected(""));
  });
});

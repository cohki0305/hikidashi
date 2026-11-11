import { describe, expect, test } from "bun:test";
import { type MakeZipEntry, makeZip } from "@/tests/helpers/make-zip";
import {
  setCentralMethod,
  setCentralUncompressedSize,
  setEncryptedFlag
} from "@/tests/helpers/zip-mutations";
import { type RangeSource, readCentralDirectory } from "./central-directory";
import { inspectSkillZip } from "./inspect-skill";

function sourceOf(bytes: Uint8Array, size = bytes.length): RangeSource {
  return {
    size,
    read: async (offset, length) => bytes.slice(offset, Math.min(bytes.length, offset + length)),
    stream: async (offset, length) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(offset, Math.min(bytes.length, offset + length)));
          controller.close();
        }
      })
  };
}

const SKILL_MD = [
  "---",
  "name: sample-skill",
  "description: 見本のスキルです",
  "---",
  "",
  "# 見本のスキル"
].join("\n");

const BASE_FILES: MakeZipEntry[] = [
  { path: "SKILL.md", data: SKILL_MD },
  { path: "scripts/run.md", data: "手順を書いたファイル\n" },
  { path: "assets/logo.bin", data: new Uint8Array([0, 1, 2, 3, 254, 255]) }
];

async function inspect(zip: Uint8Array, size = zip.length) {
  return inspectSkillZip(sourceOf(zip, size));
}

describe("inspectSkillZip", () => {
  test("直下に SKILL.md がある zip を読む", async () => {
    const zip = makeZip(BASE_FILES);
    const result = await inspect(zip);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("sample-skill");
    expect(result.value.title).toBe("sample-skill");
    expect(result.value.description).toBe("見本のスキルです");
    expect(result.value.sizeBytes).toBe(zip.length);
    expect(result.value.fileCount).toBe(3);
    expect(result.value.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "scripts/run.md",
      "assets/logo.bin"
    ]);
    expect(result.value.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const markdown = result.value.files.find((file) => file.path === "SKILL.md");
    const binary = result.value.files.find((file) => file.path === "assets/logo.bin");
    expect(markdown?.isText).toBe(true);
    expect(binary?.isText).toBe(false);
    expect(binary?.sizeBytes).toBe(6);

    const central = await readCentralDirectory(sourceOf(zip));
    expect(central.ok).toBe(true);
    if (!central.ok) return;
    const entry = central.value.find((candidate) => candidate.path === "SKILL.md");
    expect(markdown?.zipOffset).toBe(entry?.localHeaderOffset);
  });

  test("唯一のトップフォルダは外してパスをそろえる", async () => {
    const zip = makeZip([
      { path: "my-skill/SKILL.md", data: SKILL_MD },
      { path: "my-skill/scripts/run.md", data: "手順\n" }
    ]);
    const result = await inspect(zip);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fileCount).toBe(2);
    expect(result.value.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.md"]);
  });

  test("トップフォルダが 2 つあり直下に SKILL.md が無ければ断る", async () => {
    const zip = makeZip([
      { path: "one/SKILL.md", data: SKILL_MD },
      { path: "two/scripts/run.md", data: "手順\n" }
    ]);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    if (result.ok) return;
    expect(result.message).toContain("SKILL.md");
  });

  test("SKILL.md がどこにも無ければ断る", async () => {
    const zip = makeZip([{ path: "my-skill/scripts/run.md", data: "手順\n" }]);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    if (result.ok) return;
    expect(result.message).toBe("zip の一番上に SKILL.md がありません");
  });

  test("直下に SKILL.md があれば他のフォルダがあってもそのまま使う", async () => {
    const zip = makeZip([
      { path: "SKILL.md", data: SKILL_MD },
      { path: "other/run.md", data: "手順\n" }
    ]);
    const result = await inspect(zip);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((file) => file.path)).toEqual(["SKILL.md", "other/run.md"]);
  });

  for (const path of [
    "../evil.md",
    "/etc/x.md",
    "C:\\x.md",
    "a\\b.md",
    "dir//x.md",
    "dir/./x.md",
    "dir/../x.md"
  ]) {
    test(`安全でないパス ${path} は断る`, async () => {
      const zip = makeZip([
        { path: "SKILL.md", data: SKILL_MD },
        { path, data: "中身\n" }
      ]);
      const result = await inspect(zip);

      expect(result).toMatchObject({ ok: false, kind: "invalid" });
    });
  }

  test("シンボリックリンクを含む zip は断る", async () => {
    const zip = makeZip([
      { path: "SKILL.md", data: SKILL_MD },
      { path: "link.md", data: "SKILL.md", symlink: true, store: true }
    ]);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("暗号化フラグの立った zip は断る", async () => {
    const zip = makeZip(BASE_FILES);
    setEncryptedFlag(zip, "scripts/run.md");
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("ZIP64 の目印があれば断る", async () => {
    const zip = makeZip(BASE_FILES);
    new DataView(zip.buffer, zip.byteOffset, zip.byteLength).setUint16(
      zip.length - 22 + 10,
      0xffff,
      true
    );
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("stored と deflate で違う圧縮方式・順番でも指紋は同じ", async () => {
    const content = "同じ中身のファイルです\n".repeat(100);
    const deflated = makeZip([
      { path: "SKILL.md", data: SKILL_MD },
      { path: "data/note.md", data: content }
    ]);
    const stored = makeZip([
      { path: "data/note.md", data: content, store: true },
      { path: "SKILL.md", data: SKILL_MD, store: true }
    ]);

    const left = await inspect(deflated);
    const right = await inspect(stored);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.fingerprint).toBe(right.value.fingerprint);
  });

  test("中身が変われば指紋も変わる", async () => {
    const first = makeZip(BASE_FILES);
    const second = makeZip([
      BASE_FILES[0] as MakeZipEntry,
      { path: "scripts/run.md", data: "別の手順\n" },
      BASE_FILES[2] as MakeZipEntry
    ]);

    const left = await inspect(first);
    const right = await inspect(second);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.fingerprint).not.toBe(right.value.fingerprint);
  });

  test("1,001 ファイルは断る", async () => {
    const files: MakeZipEntry[] = [{ path: "SKILL.md", data: SKILL_MD }];
    for (let index = 0; index < 1000; index++) {
      files.push({ path: `files/${index}.md`, data: "x", store: true });
    }
    const result = await inspect(makeZip(files));

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("__MACOSX と .DS_Store と .hikidashi.json は数えない", async () => {
    const zip = makeZip([
      { path: "SKILL.md", data: SKILL_MD },
      { path: "scripts/run.md", data: "手順\n" },
      { path: "__MACOSX/._SKILL.md", data: "meta" },
      { path: ".DS_Store", data: "x" },
      { path: ".hikidashi.json", data: "{}" }
    ]);
    const result = await inspect(zip);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fileCount).toBe(2);
    expect(result.value.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.md"]);
  });

  test("200 MB を超える zip は読まずに断る", async () => {
    const result = await inspect(makeZip(BASE_FILES), 209_715_201);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    if (result.ok) return;
    expect(result.message).toBe("zip が大きすぎます");
  });

  test("展開後が宣言より大きい zip 爆弾は断る", async () => {
    const zip = makeZip(BASE_FILES);
    setCentralUncompressedSize(zip, "scripts/run.md", 1);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("展開後の合計が 1 GB を超える zip は断る", async () => {
    const zip = makeZip(BASE_FILES);
    setCentralUncompressedSize(zip, "scripts/run.md", 1_073_741_825);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("SKILL.md が 256 KB を超えれば断る", async () => {
    const zip = makeZip([{ path: "SKILL.md", data: "a".repeat(256 * 1024 + 1) }]);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });

  test("非対応の圧縮方式は断る", async () => {
    const zip = makeZip(BASE_FILES);
    setCentralMethod(zip, "scripts/run.md", 12);
    const result = await inspect(zip);

    expect(result).toMatchObject({ ok: false, kind: "invalid" });
  });
});

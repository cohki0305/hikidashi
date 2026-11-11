import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";

// 開発用の架空データ。作者も架空の名前。
const MB = 1024 * 1024;

export const mockSkills: SkillSummary[] = [
  {
    name: "minutes-summary",
    title: "議事録まとめ",
    description: "会議の文字起こしから、決まったこと・宿題・期限を表にまとめる。",
    latestVersion: 3,
    updatedAt: "2026-11-10T09:00:00.000Z",
    author: "suzuki@example.com",
    sizeBytes: 3 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "proposal-review",
    title: "提案書の見直し",
    description: "提案書を顧客の立場で読み、わかりにくい所と足りない数字を指摘する。",
    latestVersion: 5,
    updatedAt: "2026-11-08T09:00:00.000Z",
    author: "kimura@example.com",
    sizeBytes: 5 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "quote-pdf",
    title: "見積書PDF",
    description: "品目と金額を伝えると、会社の書式の見積書を1枚のPDFで作る。",
    latestVersion: 2,
    updatedAt: "2026-11-02T09:00:00.000Z",
    author: "suzuki@example.com",
    sizeBytes: 40 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "hearing-prep",
    title: "ヒアリング準備",
    description: "訪問先の会社名から、事前に聞くことの一覧と仮説を作る。",
    latestVersion: 1,
    updatedAt: "2026-10-30T09:00:00.000Z",
    author: "tanaka@example.com",
    sizeBytes: 2 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "work-inventory",
    title: "業務の棚卸し",
    description: "社員へのアンケート結果から、AIで楽にできそうな仕事を洗い出す。",
    latestVersion: 4,
    updatedAt: "2026-10-27T09:00:00.000Z",
    author: "kimura@example.com",
    sizeBytes: 6 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "weekly-report",
    title: "週次報告",
    description: "1週間のメモから、顧客向けの週次報告メールの下書きを作る。",
    latestVersion: 2,
    updatedAt: "2026-10-21T09:00:00.000Z",
    author: "tanaka@example.com",
    sizeBytes: 2 * 1024,
    claudeCodeOnly: false
  },
  {
    name: "video-subtitles",
    title: "動画の字幕入れ",
    description: "動画の話し声から字幕を作り、動画に焼き込む。",
    latestVersion: 1,
    updatedAt: "2026-10-15T09:00:00.000Z",
    author: "kimura@example.com",
    sizeBytes: 95 * MB,
    claudeCodeOnly: true
  }
];

const textBodies: Record<string, string> = {
  "SKILL.md": "# 手順\n\n1. 内容を読む\n2. 要点をまとめる\n3. 書式に合わせて出す\n",
  "template.md": "# {題名}\n\n## 要約\n\n## 本文\n"
};

/** 詳細の偽の応答。 */
export function mockDetail(name: string): SkillDetailResponse | null {
  const skill = mockSkills.find((s) => s.name === name);
  if (!skill) return null;
  const files = skill.claudeCodeOnly
    ? [
        { path: "SKILL.md", sizeBytes: 600, isText: true },
        { path: "assets/intro.mp4", sizeBytes: skill.sizeBytes - 600, isText: false }
      ]
    : [
        { path: "SKILL.md", sizeBytes: 600, isText: true },
        { path: "template.md", sizeBytes: 200, isText: true }
      ];
  const versions = Array.from({ length: skill.latestVersion }, (_, i) => ({
    version: skill.latestVersion - i,
    note: i === 0 ? "最新の内容に更新" : null,
    publishedBy: skill.author,
    createdAt: skill.updatedAt,
    fingerprint: `fp-${skill.name}-${skill.latestVersion - i}`,
    sizeBytes: skill.sizeBytes,
    fileCount: files.length
  }));
  return { skill, files, versions };
}

/** ファイルのプレビュー本文。 */
export function mockFileBody(path: string): string | null {
  return textBodies[path] ?? null;
}

export const mockMe = { email: "sato@example.com" };

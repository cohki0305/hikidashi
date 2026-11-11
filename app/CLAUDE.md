# app

React の SPA（Vite・TanStack Router・TanStack Query）。サーバーとは API の型（`import type`）だけでつながる。

## 置き場所

- `routes/`: 画面のルート（TanStack Router のファイルベース）。`routeTree.gen.ts` は生成物なので手で直さない
- `components/ui/`: 汎用の部品
- `lib/`: 横断ユーティリティ。API のクライアントは `lib/api.ts` に置く
- `styles.css`: 全体のスタイル。色は CSS 変数にまとめ、画面ごとに色の値を直接書かない
- `main.tsx`: 起動の入口

## すること

- API の型は `hc<AppType>` から受ける。server の型は `import type` だけで参照する
- 画面の文言は非エンジニアのメンバーが読む言葉で書く（技術用語を出さない）
- テストは対象の隣に置く（`*.test.tsx`）
- 画面と API の約束は `shared/schemas/` の zod スキーマから導いた型を使う

## しないこと

- server の runtime import（型だけが許される）
- 部品（components）から `lib/api.ts` を直接呼ぶ（データ取得は画面か hooks が持つ）
- 色の値を直接書く
- `createFileRoute` の引数を `as` で書き換える（`app/routeTree.gen.ts` を作り直す）

## 機械的に縛っているもの

- `bun run lint:deps`: app → server の runtime import の禁止
- `bun run lint:boundary`: app → server の値 import の禁止（型は許す）
- `bun run lint:no-route-type-cast`: `createFileRoute` の型の書き換えの禁止
- `bun run typecheck`（tsc）と `bun run test`（bun:test）

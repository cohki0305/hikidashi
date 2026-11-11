# hikidashi

チームのスキルを Claude の会話だけで配る社内向けサービス。

- Web アプリ: React + Vite + TanStack Router / Query（`app/`）
- サーバー: Hono（Cloudflare Workers、`server/`）
- 画面と API の約束: zod スキーマ（`shared/schemas/`）
- 設計: [docs/superpowers/specs/2026-11-11-teamskill-design.md](docs/superpowers/specs/2026-11-11-teamskill-design.md)

## 開発の始め方

bun を使う。依存を入れると `lefthook` のフックも同時に有効になる。

```sh
bun install
```

## 画面と API

開発中は 1 つのサーバーで画面と API の両方が動く。`bun run dev` を起動して `http://localhost:5173/` を開くと画面が出て、同じサーバーの `/api/health` が API を返す。

本番と同じ形（ビルドした画面のファイルを Worker から配信する形）を手元で確かめるときは、先にビルドしてから Worker を起動する。

```sh
bun run build
bun run dev:server
```

起動したら、次の 4 つを確かめる。

| URL                                | 期待する応答                                            |
| ---------------------------------- | ------------------------------------------------------- |
| `/`                                | 画面（`dist/client/index.html`）                        |
| `/skills/example` のような深い URL | いまは画面がトップだけなので 404。本文は `/` と同じ画面 |
| `/api/health`                      | JSON（`{"ok":true}`）                                   |
| `/api/nope`                        | JSON の 404（画面ではなく API として応答する）          |

## ルーティングの生成物（`app/routeTree.gen.ts`）

TanStack Router のルートは `app/routes/` に置くと `app/routeTree.gen.ts` が自動で作られる。この生成物はコミットする（`typecheck` とビルドはこのファイルがある前提で動く）。ルートを足したり消したりしたら、次を一度走らせて作り直し、できた差分をコミットする。

```sh
bun run dev    # ルートを足すと生成され直す。Ctrl-C で止めてよい
bun run build  # ビルドのときにも生成され直す
```

生成物は手で直さない。方針や手順を変えるときはこの節を直す。

## コマンド

| コマンド              | 内容                                                           |
| --------------------- | -------------------------------------------------------------- |
| `bun run dev`         | 開発サーバーを起動する（画面と API が同じサーバーで動く）      |
| `bun run build`       | 画面と Worker をビルドする（出力は `dist/`）                   |
| `bun run dev:server`  | ビルドした画面を Worker から配る形で起動する（`wrangler dev`） |
| `bun run lint`        | biome でコードを点検する                                       |
| `bun run lint:fix`    | biome の指摘を書き換えて直す                                   |
| `bun run lint:deps`   | dependency-cruiser で層と境界の依存を点検する                  |
| `bun run lint:custom` | 独自 lint をまとめて当てる                                     |
| `bun run lint:all`    | 上の 3 つをまとめて当てる                                      |
| `bun run typecheck`   | TypeScript の型を点検する                                      |
| `bun run test`        | テストを実行する                                               |

独自 lint の一覧と使い方は [CLAUDE.md](./CLAUDE.md) にある。

コミットするときは `lefthook` が staged のファイルに biome を当て、`lint:deps` と `lint:custom` を並列で走らせる。手元で同じ点検を通すなら `bunx lefthook run pre-commit`。

## テスト

- テストは bun:test で、実装の隣に `*.test.ts` / `*.test.tsx` として置く。
- 1 つのテストだけを走らせるときは、対象のファイルを明示する（例: `bun test ./server/app.test.ts`）。
- 共通部品と約束は [tests/CLAUDE.md](./tests/CLAUDE.md) にある。

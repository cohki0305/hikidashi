# hikidashi

チームのスキルを Claude との会話だけで配る社内向けサービス。単一パッケージ（bun）。コード・コメント・文書・コミットメッセージは日本語。

## リポジトリ構成

```
app/        Web アプリ（React + Vite + TanStack Router / Query）
server/     Hono API（api / services / repositories / db / schemas / middleware / lib / entry）
shared/     app と server で使う純粋な関数と zod スキーマ
scripts/    lint ランナーと各 lint、開発用スクリプト
```

## 依存の向き

- サーバー: API → Service → Repository → DB の一方向。逆向きは禁止。API は Repository・DB を import しない。
- DB への runtime 依存は `server/repositories/` と `server/db/` だけ。DB は D1（`drizzle-orm/d1`）を使う。
- `shared/` は zod 以外に依存しない。`app/` `server/` を import しない。
- `app/` は `server/` を型（`import type`）だけ import できる。runtime import は禁止。
- `server/` は `app/` に依存しない。
- 例外を投げず `Result` を返す（`server/lib/result.ts`）。`ok` と `notFound` / `invalid` / `conflict` / `forbidden` / `rateLimited` / `upstream` を使い、HTTP への変換は `failure(c, err)`（`server/lib/http.ts`）に任せる。
- スキーマは `shared/schemas/` に置き、型は `z.infer` で導く。

## 守ること

- 画面とツールの説明は、非エンジニアのメンバーが読む言葉で書く。技術用語を出さない
- 本番にテスト送信しない。テストで本物の Cloudflare・Google を呼ばない
- 架空データだけを使う。本物の個人情報をコード・テスト・文書に出さない
- 変更は作った側が、手元で最後まで確かめてから報告する

## 機械的に縛っているもの

`bun run lint:all`（biome・dependency-cruiser・独自 lint）と `bun run typecheck`（tsc）・`bun run test`（bun:test）が品質ゲートになる。コミット時は `lefthook` が staged のファイルに biome を当て、`lint:deps` と `lint:custom` を並列で走らせる。手元で同じ点検を通すなら `bunx lefthook run pre-commit`。

## lint の使い方

| コマンド              | 内容                                          |
| --------------------- | --------------------------------------------- |
| `bun run lint`        | biome でコードを点検する                      |
| `bun run lint:fix`    | biome の指摘を書き換えて直す                  |
| `bun run lint:deps`   | dependency-cruiser で層と境界の依存を点検する |
| `bun run lint:custom` | 独自 lint をまとめて当てる                    |
| `bun run lint:all`    | 上の 3 つをまとめて当てる                     |
| `bun run typecheck`   | TypeScript の型を点検する                     |
| `bun run test`        | テストを実行する                              |

独自 lint は 1 つのランナー（`bun run lint:custom`）で、ファイルごとに oxc-parser で 1 回だけ解析して全ルールに渡す。個別に確かめるときは `lint:<name>` の script を使う。

### 構造と import

| ルール                                   | 内容                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `bun run lint:boundary`                  | `app/` から `server/` への値 import を禁止する（型の import は許す）                      |
| `bun run lint:import-alias`              | import の指定子を `@/` に一本化する（同じフォルダの `./x` だけ許す）                      |
| `bun run lint:lib-layout`                | `app/lib` と `server/lib` の直下に置けるファイルを固定する                                |
| `bun run lint:test-colocate`             | テストを実装の隣に置き、ハンドラ・サービス・リポジトリ・hooks を `{name}/index.ts` にする |
| `bun run lint:no-bun-runtime`            | `server/` と `shared/` で `Bun.*` と `bun:` import を禁止する                             |
| `bun run lint:no-fixture-runtime-import` | テスト以外のコードが `tests/fixtures` を import することを禁止する                        |
| `bun run lint:derived-types`             | 型を schema から導出させ、手書きの Request / Response / Body / Dto を禁止する             |
| `bun run lint:no-type-program`           | lint のコードで型情報（`createProgram` など）を使うことを禁止する                         |
| `bun run lint:docs-refs`                 | 文書に書いたコマンド参照（`bun run` に続く名前）が実在する script であることを確かめる    |

### サーバー

| ルール                            | 内容                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run lint:hono-style`         | `server/api` の Hono の書き方（ルート表・action 名・ハンドラの置き場）を縛る               |
| `bun run lint:route-rest`         | ルートパスの動詞と、`server/api` の try 文を禁止する                                       |
| `bun run lint:api-contract`       | `zValidator` に渡す schema の置き場と名前に役割を持たせる                                  |
| `bun run lint:layer-class`        | services / repositories が class を export し、依存をコンストラクタで受けることを縛る      |
| `bun run lint:services`           | サービスの 1 ファイル 300 行までと、`{Name}Service` の export を縛る                       |
| `bun run lint:drift`              | `server/services` は `-service`、`server/repositories` は `-repository` で終わる名前にする |
| `bun run lint:repo-single-table`  | 1 つの repository が扱うテーブルを 1 つにする                                              |
| `bun run lint:no-throw`           | Service と `server/lib` で throw せず Result を返す                                        |
| `bun run lint:no-route-type-cast` | `createFileRoute` の引数を `as` で書き換えない                                             |
| `bun run lint:schema-location`    | zod の schema を `shared/schemas/` と `server/schemas/` に限る                             |

### DB

| ルール                            | 内容                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `bun run lint:db-access`          | DB ハンドルの操作を `server/repositories` と `server/db` に閉じ込める |
| `bun run lint:drizzle-migrations` | `drizzle/` の journal・snapshot・sql の整合を確かめる                 |

## テストの置き方

- テストは実装の隣に `{name}.test.ts` / `{name}.test.tsx` で置く。`tests/` には全テスト共通の前処理と部品だけを置く。
- テスト用のデータは `tests/fixtures/` に置く。runtime のコードからは import しない。
- 詳しい約束は `tests/CLAUDE.md` にある。

## 層ごとの規約

- `server/CLAUDE.md`: サーバーの層と入口
- `server/api/CLAUDE.md`: HTTP の入口の書き方
- `app/CLAUDE.md`: 画面の置き場所と依存
- `tests/CLAUDE.md`: テストの共通部品と約束

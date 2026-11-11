# tests

テストの共通部品と約束。

## 置き方

- テストは実装の隣に `{name}.test.ts` / `{name}.test.tsx` で置く（`lint:test-colocate` が検査する）。
- `tests/` に置くのは全テスト共通のものだけにする。
  - `tests/preload.ts`: `bun test` の前処理
  - `tests/helpers/dom-setup.ts`: DOM を読むテスト用の happy-dom の登録
  - `tests/fixtures/`: テスト専用のデータ。runtime のコードから import しない（`lint:no-fixture-runtime-import` が検査する）

## 守ること

- 架空データだけを使う。本物の個人情報をテストに出さない。
- 本物の外部サービス（Cloudflare・Google など）を呼ばない。差し替え可能な口を作り、テストでは偽物を使う。本番にテスト送信しない。
- テストごとに前のテストの残りに依存しない。順番を変えても同じ結果になるように書く。
- 1 つのテストだけを走らせるときは、対象のファイルを明示する（例: `bun test ./server/app.test.ts`）。

## DB を使うテスト

- DB は D1 を使う。テスト用の D1 と後始末の共通部品は issue #3 で `tests/helpers/` に足す。
- 接続は `server/db` の口を使い、ドライバを直接 import しない（`lint:deps` が検査する）。

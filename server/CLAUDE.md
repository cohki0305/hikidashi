# server

Cloudflare Workers 上の Hono API。

## 層の役割と依存の向き

API → services → repositories → db。逆向きは禁止。

| 層           | 置き場                                                                                                          | 役割                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| API          | `server/api/protected/{domain}/`（`routes.ts` の表 + `handlers/{dir}/index.ts`。規約は `server/api/CLAUDE.md`） | HTTP の入口。検証・サービス呼び出し・レスポンス整形だけ      |
| services     | `server/services/{name}-service/`                                                                               | 業務ロジックと、DB 操作の組み立て                            |
| repositories | `server/repositories/{table}-repository/`                                                                       | DB の読み書き。DB ハンドルを触るのはここと `server/db/` だけ |
| middleware   | `server/middleware/`                                                                                            | 横断処理。services・repositories・api を import しない       |
| lib          | `server/lib/`                                                                                                   | 共通部品（`result.ts` `http.ts`）                            |

DB は D1 を使う（`drizzle-orm/d1`）。接続の組み立ては `server/db/` に閉じ込める。

## 守ること

- handlers は Service を `c.var` から受ける（`createApp` が組み立てて注入する）。API から Service を直接 import しない
- 想定内の失敗は throw せず `Result<T>`（`ok` / `notFound` / `invalid` / `conflict` / `forbidden` / `rateLimited` / `upstream`）で返し、`failure(c, err)` で HTTP に写す
- 予期しない例外は `createApp` の `onError` が 500 `{ error: "Internal server error" }` にし、相関 ID と例外の種類（`name`）だけをログに出す。例外の本文は応答にもログにも出さない
- 型は `shared/schemas/` の zod スキーマから導く
- テストは実装の隣に置く（`*.test.ts`）

## DON'T

- `server/` と `shared/` で `Bun.*`・`bun:*` を使わない（本番は Workers で動く。Bun 専用の処理は `scripts/` か `tests/` に置く）
- API から repositories・db を import しない
- リクエスト本文や個人情報を `logError` に渡さない

## 入口

- `server/app.ts` の `createApp(deps)` が API を組み立て、`AppType` を公開する。`logError` は注入でき、テストで差し替える
- `server/bootstrap.ts` が本番の依存を組み立てて `createApp` に渡す。環境の違い（D1・R2 の束縛など）はここに閉じ込める
- `server/entry/worker.ts` が Workers の入口（`wrangler.jsonc` の `main`）。`/api` などは Hono へ、それ以外は `server/entry/pages.ts` が画面かファイルを返す（画面の無い道は 404）
- 束縛を足すときは `wrangler.jsonc` と `BootstrapEnv` を同じ変更で直す

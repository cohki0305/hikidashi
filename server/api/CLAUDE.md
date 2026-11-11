# server/api

HTTP の入口。検証・サービス呼び出し・レスポンス整形だけを書く。ここの規約は `scripts/lint-hono-style.ts` と `scripts/lint-route-rest.ts` が機械的に縛る。

## 構成

```
server/api/protected/{domain}/
  context.ts                 そのドメインの Env 型と Service の口
  routes.ts                  ルートの表（1 行 1 エンドポイント）
  index.ts                   型と routes の再エクスポートだけ
  handlers/{dir}/index.ts    ハンドラ（action ごとに export）
  handlers/{dir}/index.test.ts
```

- `routes.ts` の表にだけルートを書く。ハンドラは `handlers/{dir}/` から `...spread` するだけで、表に直書きしない
- 合成の `index.ts`（`handlers/` 以外）にはルートを書かず、`.route()` と middleware・`onError` だけにする。`server/app.ts` も `.route()` のマウントだけ
- ハンドラは `factory.createHandlers(zValidator(...), async (c) => ...)` で作る。名前付き関数に切り出さない（RPC の型推論が壊れる）
- `.on(` は使わない。メソッドとパスが表の検査をすり抜ける
- パスは文字列リテラルで書く（定数や式は検査をすり抜ける）
- 1 ファイルで収まる小さな API（`server/api/health/` など）は resource の表を使わず、`routes.ts` に直接 1 行で書いてよい

## 表（routes.ts）

```ts
export const skillRoutes = factory
  .createApp()
  .get("/skills", ...skills.index)
  .get("/skills/:name", ...skills.show)
  .post("/skills/:name/versions", ...skillVersions.create)
  .get("/uploads", ...uploads.index);
```

## 5 つの action

ハンドラの export 名は次の 5 つだけ。メソッドとパスの形で決まる。

| メソッド    | パスの末尾 | action    | 例                     |
| ----------- | ---------- | --------- | ---------------------- |
| GET         | 資源名     | `index`   | `GET /skills`          |
| GET         | `:name`    | `show`    | `GET /skills/:name`    |
| POST        | 資源名     | `create`  | `POST /skills`         |
| PUT / PATCH | 任意       | `update`  | `PATCH /skills/:name`  |
| DELETE      | 任意       | `destroy` | `DELETE /skills/:name` |

メソッドと action が合わないルートは lint が止める。

## dir 名の導き方

`handlers/{dir}/` の名前はパスから機械的に決まる。

- 静的な語が 1 つ: その語（`/skills` → `skills`、`/uploads` → `uploads`）
- 静的な語が 2 つ以上: 親を単数形、最後を複数形にして `-` でつなぐ
  - `/skills/:name/versions` → `skill-versions`
  - `/skills/:name/files` → `skill-files`
- `:param` は dir 名に入れない。

### 複数形

- 最後の語は複数形、親は単数形にする。規則（`s` を付ける・外す、`ies` ↔ `y`）で決まらない語は lint が `unknown-inflection` で止めるので、`scripts/lint-hono-style.ts` の `SINGULAR_TO_PLURAL` に足す。
- 集計 1 件のような資源も URL は複数形にし、`index` で返す。

## 動詞を使わない

パスに動詞（`publish` `confirm` `cancel` `resend` `send` `reset` など。`-` で区切った各語も見る）を書かない。状態遷移・操作は「その結果として作られる記録」を資源にして `POST` の `create` にする。

| やりたいこと     | 悪い例                       | 良い例                        |
| ---------------- | ---------------------------- | ----------------------------- |
| スキルを公開する | `POST /skills/:name/publish` | `POST /skills/:name/versions` |
| まとめて消す     | `DELETE /skills`             | `POST /skill-deletions`       |

- 「まとめて消す」のように index 相当の一括 `DELETE` は作らず、消す操作を資源（`skill-deletions`）にする。
- 名詞として許す語（`settings` `status` `versions` `files` `uploads` `downloads` など）は `NOUN_SEGMENTS` にある。動詞辞書に引っかかる名詞を使うときはここに足す。

## 入力と出力

- パス引数は `c.req.param()` で読まず `zValidator("param", …)` で受け、`c.req.valid("param")` で使う。
- 本文は `c.req.json()` + `safeParse` ではなく `zValidator("json", …)` で受ける。`zValidator` に渡す schema は `shared/schemas/{domain}/request/` に置き、名前を役割に合わせる（`…ParamsSchema` / `…QuerySchema` / `createSkillSchema`。lint:api-contract）。
- 検証に失敗したら `failure(c, invalid("入力が正しくありません"))` で返す。
- `handlers/` では `c.json()` / `c.body()` を直接呼ばず、`@/server/lib/http` の `ok` / `created` / `accepted` / `noContent` / `failure` を使う。
- 例外を投げず、`try` も書かない。失敗は `Result` で返し、`onError` に集約する。

## 新しいエンドポイントを足す手順

1. パスとメソッドを決める（動詞を使わない。必要なら資源を作る）。
2. dir 名と action を上の規則で導く。
3. `handlers/{dir}/index.test.ts` を先に書く（隣にテストが無いと lint が止める）。
4. `handlers/{dir}/index.ts` に `export const {action} = factory.createHandlers(...)` を書く。
5. `routes.ts` の表に 1 行足す。
6. `bun run lint:all` と `bun run typecheck` を通す。

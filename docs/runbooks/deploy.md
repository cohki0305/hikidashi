# workers.dev に公開する

hikidashi を `https://hikidashi.<サブドメイン>.workers.dev` で公開する手順です。独自ドメインは使いません。
Cloudflare の管理画面と、手元のターミナルで作業します。公開（`wrangler deploy`）は人が行います。

## 0. 準備

- Cloudflare のアカウントを用意する。
- 手元で `bun install` を済ませる。
- `bunx wrangler login` で Cloudflare にログインする。
- `<サブドメイン>` は、Cloudflare の管理画面「Workers & Pages」で確認できる workers.dev のサブドメインに読み替える。
- `wrangler.jsonc` を `wrangler.production.jsonc` に写す（`cp wrangler.jsonc wrangler.production.jsonc`）。本番の値はこの写しにだけ書く。このファイルは git に入れない（`.gitignore` 済み）。
- 写しの先頭（`"name"` の次の行）に、使う Cloudflare のアカウントの `"account_id"` を足す。ログイン中に複数のアカウントが見えても、ここに出る。

## 1. D1 を作る

スキルの情報をしまう D1 のデータベースを 1 つ作ります。

```sh
bunx wrangler d1 create hikidashi
```

表示された `database_id` を、`wrangler.production.jsonc` の `d1_databases` にある `database_id` に入れます。

## 2. マイグレーションを当てる

作った D1 にテーブルを作ります。

```sh
bun run db:migrate:prod
```

`--remote` を忘れないでください。忘れると手元の D1 だけに入り、本番には入りません。
テーブルを増やす変更を入れたときも、公開の前にこのコマンドをもう一度実行します。

## 3. R2 のバケットを作る

スキルの zip を置くバケットを作ります。

```sh
bunx wrangler r2 bucket create hikidashi-skills
```

バケットの名前は `wrangler.production.jsonc` の `R2_BUCKET_NAME` と合わせます。

## 4. R2 の API トークンを作る

zip の出し入れに使うキーを発行します。

1. Cloudflare の管理画面で R2 を開きます。
2. 「Manage R2 API Tokens」から「Create API token」を選びます。
3. 権限は「Object Read & Write」にします。
4. 対象は `hikidashi-skills` バケットだけに絞ります。
5. 発行時に出る Access Key ID と Secret Access Key を控えます。この画面を閉じると Secret Access Key は再表示できません。

## 5. シークレットと vars を入れる

R2 のキーは Worker のシークレットとして入れます。

```sh
bunx wrangler secret put R2_ACCESS_KEY_ID
bunx wrangler secret put R2_SECRET_ACCESS_KEY
```

それぞれ、入力を求められたら手元で控えた値を貼ります。キーの値はどの設定ファイルにも書きません。

`wrangler.production.jsonc` の `vars` に次の値を入れます。

| 名前                 | 入れる値                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| `APP_URL`            | `https://hikidashi.<サブドメイン>.workers.dev`（末尾の `/` なし）          |
| `R2_ACCOUNT_ID`      | Cloudflare のアカウント ID（R2 の画面に出る）                              |
| `ACCESS_TEAM_DOMAIN` | Access のチームの URL（例: `https://<チーム名>.cloudflareaccess.com`）     |
| `ACCESS_AUD`         | Access アプリの AUD（次の手順で作るアプリの値）                            |
| `OWNER_EMAILS`       | 常にメンバーとみなす人のメールアドレス（カンマ区切り。空なら誰も入れない） |

## 6. Access のアプリを作る

ホスト全体を守るアプリと、Claude がつなぐ道を外す Bypass のアプリの 2 つを作ります。手順は [access.md](./access.md) にあります。
守るアプリの AUD を、`wrangler.production.jsonc` の `ACCESS_AUD` に入れます。

## 7. 公開する

先に設定が通るかを、本番に出さずに確かめます。

```sh
HIKIDASHI_WRANGLER_CONFIG=wrangler.production.jsonc bunx vite build
bunx wrangler deploy --dry-run
```

問題が無ければ公開します（本番の値でビルドし直してから公開します）。

```sh
bun run deploy
```

## 8. 公開した後に確かめる

`https://hikidashi.<サブドメイン>.workers.dev` を `<URL>` として、次を確かめます。

```sh
curl -i <URL>/api/me
curl -i <URL>/.well-known/oauth-authorization-server
curl -i <URL>/mcp
```

- Access を通らずに `/api/me` が 401 になる。
- `/.well-known/oauth-authorization-server` が JSON を返す。
- `/mcp` がトークンなしで 401 になり、`WWW-Authenticate` のヘッダーが付く。
- ブラウザで `<URL>` を開き、Access のログインを通るとスキルの一覧が出る。

## 9. メンバーを出し入れする

使える人を増やす・減らすときは、hikidashi の画面「メンバー」で行います。Access のポリシーは変えません。
詳しくは [access.md](./access.md) を見てください。

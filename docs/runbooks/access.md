# Cloudflare Access で hikidashi を守る

hikidashi は `https://hikidashi.<サブドメイン>.workers.dev` で公開し、入口の本人確認は Cloudflare Access に任せます。
この手順では、ホスト全体にログインを求める self-hosted アプリを 1 つ作り、
Claude がつなぐ道だけを **Bypass** のアプリ 1 つで外します。
新しい画面や API を足しても、何もしなければログインが要る側に入ります。

Access が確かめるのは「その人が本人かどうか」だけです。
中身を使えるかどうか（メンバーかどうか）は hikidashi 側で決めます。

## 1. Worker 全体を守る設定は使わない

Worker の画面にある「Protect this Worker behind Access」は使いません。
これを使うと `/mcp` まで Access に塞がれ、claude.ai からつながらなくなるためです。
代わりに、次の節で作るホスト単位の self-hosted アプリで守ります。

## 2. ホスト全体を守るアプリを作る

1. Cloudflare の管理画面で「Zero Trust」→「Access」→「Applications」を開きます。
2. 「Add an application」から「Self-hosted」を選びます。
3. アプリの名前を「hikidashi」にします。
4. 宛先（destinations）に `hikidashi.<サブドメイン>.workers.dev` を、道を付けずに 1 つだけ入れます。
5. ポリシーを「Allow」にし、Include を「Everyone」にします。メールのコードで本人確認できた人は、この時点では誰でも入口を通れます。
6. 保存したら、アプリの概要に出る AUD を `wrangler.production.jsonc` の `ACCESS_AUD` に入れます。

入口を通れる人と、中身を使える人は別です。中身を使えるのは hikidashi のメンバーだけです。
メンバーの出し入れは 5 節の画面で行います。

すでにメールアドレスの一覧で許可していた場合は、先に新しい版を公開して動くことを確かめてから、
ポリシーを「Include: Everyone」に変えます。逆にすると、新しい版が出る前に誰でも入れる時間ができます。

画面（`/`・`/skills/*`・`/connect`・`/authorize`）、画面が使う API（`/api/*`）、
Claude からのつなぐ頼みを受ける `/oauth/authorize` は、すべてこのアプリで守られます。

## 3. Claude がつなぐ道を Bypass のアプリで外す

同じホストの中で複数のアプリがあるときは、**より具体的な道のアプリが優先されます**。
そこで、下の道を宛先に並べた self-hosted アプリを 1 つ作り、ポリシーを「Bypass」にします。

1. 「Zero Trust」→「Access」→「Applications」から「Add an application」を選びます。
2. 「Self-hosted」を選び、名前を「hikidashi（Claude の入口）」にします。
3. 宛先（destinations）に、下の表の道を 1 つずつ追加します。ホストは守るアプリと同じです。
4. ポリシーを「Bypass」にし、Include を「Everyone」にします。

| 守らない道        | 理由                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `/mcp`            | OAuth のトークンで守る。claude.ai がブラウザのログインを挟まずに呼ぶため |
| `/oauth/register` | 同上                                                                     |
| `/oauth/token`    | 同上                                                                     |
| `/.well-known/*`  | 同上。Claude が「どこに許可を聞けばよいか」を知るための案内              |
| `/assets/*`       | 画面の部品だけで、データは含まない                                       |

`/.well-known/*` と `/assets/*` の `*` を忘れないでください。

Bypass のアプリは Access の JWT を出しません。
そのため `ACCESS_AUD` に入れる値は、守るアプリの AUD 1 つだけでかまいません。

## 4. つながらないときに確かめること

- Bypass のアプリの宛先の綴り、とくに `/.well-known/*` と `/assets/*` の `*` を確かめます。
- `APP_URL` が実際の URL と一致しているか（末尾に `/` が付いていないか）を確かめます。
- `ACCESS_AUD` が、いま使っているアプリの AUD と一致しているか確かめます。
- `/mcp` が Access のログイン画面へ 302 で飛ぶときは、Bypass のアプリが無いか、宛先が `/mcp` になっていないかを確かめます。
- Access のアプリを外した状態でも、`/oauth/authorize` と `/api/oauth-requests/*` は 401 になります。設定を外しても素通りしません。
- 公開した後の確かめ方は [deploy.md](./deploy.md) にあります。

## 5. メンバーを出し入れする

使える人を増やす・減らすときは、hikidashi の画面「メンバー」で行います。
Access のポリシーは「Include: Everyone」のまま変えません。入口は本人確認だけを担当します。

- 人を増やすときは「メンバー」で招待リンクを作り、そのリンクを本人に渡します。リンクを開いた人がメンバーになります。
- 人を減らすときは「メンバー」でその人を外します。外した人は、それまでの許可がすぐに効かなくなります。
- 最初のメンバーは `wrangler.production.jsonc` の `OWNER_EMAILS` に書いた人です。この人は常にメンバーで、外せません。

Bypass のアプリは誰でも通すので、ポリシーを変える必要はありません。

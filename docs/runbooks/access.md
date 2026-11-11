# Cloudflare Access で hikidashi を守る

hikidashi は `https://hikidashi.<サブドメイン>.workers.dev` で公開し、入口の本人確認は Cloudflare Access に任せます。
この手順では、ログインを求める self-hosted アプリを **1 つ** 作り、守る道を宛先（destinations）に並べます。
あわせて、守らない道には **Bypass** のアプリを別に作ります。

## 1. Worker 全体を守る設定は使わない

Worker の画面にある「Protect this Worker behind Access」は使いません。
これを使うと `/mcp` まで Access に塞がれ、claude.ai からつながらなくなるためです。
代わりに、次の節で作る self-hosted アプリの宛先に、守る道だけを並べます。

## 2. 守る道のアプリを 1 つ作る

1. Cloudflare の管理画面で「Zero Trust」→「Access」→「Applications」を開きます。
2. 「Add an application」から「Self-hosted」を選びます。
3. アプリの名前を「hikidashi」にします。
4. 宛先（destinations）に、下の表の道を 1 つずつ追加します。ホストは `hikidashi.<サブドメイン>.workers.dev` です。
5. ポリシーを「Allow」にし、使ってよい人のメールアドレスを一覧で並べます（グループでもかまいません）。
6. 保存したら、アプリの概要に出る AUD を `wrangler.jsonc` の `ACCESS_AUD` に入れます。

| 守る道             | 中身                              |
| ------------------ | --------------------------------- |
| `/`                | スキル一覧の画面                  |
| `/skills/*`        | スキルの詳細の画面                |
| `/connect`         | つなぎ方の画面                    |
| `/authorize`       | つなぐかどうかを選ぶ画面          |
| `/api/*`           | 画面が使う API                    |
| `/oauth/authorize` | Claude からのつなぐ頼みを受ける道 |

`/skills/*` と `/api/*` の `*` を忘れないでください。`*` が無いと、その下の道が守られません。

## 3. 守らない道には Bypass のアプリを作る

Access では、ある道を宛先にすると、その下の道もまとめて守られます。
そのため `/` を宛先にすると、`/mcp`・`/oauth/token`・`/.well-known/*` までログインを求められ、claude.ai がつながらなくなります。

同じホストの中で複数のアプリがあるときは、**より具体的な道のアプリが優先されます**。
そこで、守らない道ごとに別の self-hosted アプリを作り、ポリシーを「Bypass」にします。

1. 「Zero Trust」→「Access」→「Applications」から「Add an application」を選びます。
2. 「Self-hosted」を選び、名前を「hikidashi bypass mcp」のように分かりやすい名前にします。
3. ホストは守るアプリと同じ `hikidashi.<サブドメイン>.workers.dev` にし、宛先（destinations）に下の表の道を 1 つだけ入れます。
4. ポリシーを「Bypass」にし、Include を「Everyone」にします。
5. 残りの道も同じように、1 つずつアプリを作ります。

| 守らない道        | 理由                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `/mcp`            | OAuth のトークンで守る。claude.ai がブラウザのログインを挟まずに呼ぶため |
| `/oauth/register` | 同上                                                                     |
| `/oauth/token`    | 同上                                                                     |
| `/.well-known/*`  | 同上。Claude が「どこに許可を聞けばよいか」を知るための案内              |
| `/assets/*`       | 画面の部品だけで、データは含まない                                       |

Bypass のアプリは Access の JWT を出しません。
そのため `ACCESS_AUD` に入れる値は、守るアプリの AUD 1 つだけでかまいません。

## 4. つながらないときに確かめること

- 宛先の綴り、とくに `/skills/*` と `/api/*` の `*` を確かめます。
- `APP_URL` が実際の URL と一致しているか（末尾に `/` が付いていないか）を確かめます。
- `ACCESS_AUD` が、いま使っているアプリの AUD と一致しているか確かめます。
- `/mcp` が Access のログイン画面へ 302 で飛ぶときは、Bypass のアプリが無いか、宛先が `/mcp` になっていないかを確かめます。
- Access のアプリを外した状態でも、`/oauth/authorize` と `/api/oauth-requests/*` は 401 になります。設定を外しても素通りしません。
- 公開した後の確かめ方は [deploy.md](./deploy.md) にあります。

## 5. メンバーを出し入れする

使える人を増やす・減らすときは、守るアプリのポリシーだけを変えます。
Bypass のアプリは誰でも通すので、ポリシーを変える必要はありません。
hikidashi 側に利用者の一覧は持たないので、ほかに変える場所はありません。

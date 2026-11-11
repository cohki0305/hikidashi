# Cloudflare Access で hikidashi を守る

hikidashi は `https://hikidashi.<サブドメイン>.workers.dev` で公開し、入口の本人確認は Cloudflare Access に任せます。
この手順では、Access の self-hosted アプリを **1 つだけ** 作り、守る道だけを宛先（destinations）に並べます。

## 1. Worker 全体を守る設定は使わない

Worker の画面にある「Protect this Worker behind Access」は使いません。
これを使うと `/mcp` まで Access に塞がれ、claude.ai からつながらなくなるためです。
代わりに、次の節で作る self-hosted アプリの宛先に、守る道だけを並べます。

アプリを 1 つにするのは、`ACCESS_AUD` に入れる値を 1 つにするためです。

## 2. アプリを 1 つ作る

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

## 3. 守らない道と、その理由

次の道は Access の宛先に入れません。

| 守らない道        | 理由                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `/mcp`            | OAuth のトークンで守る。claude.ai がブラウザのログインを挟まずに呼ぶため |
| `/oauth/register` | 同上                                                                     |
| `/oauth/token`    | 同上                                                                     |
| `/.well-known/*`  | 同上。Claude が「どこに許可を聞けばよいか」を知るための案内              |
| `/assets/*`       | 画面の部品だけで、データは含まない                                       |

## 4. つながらないときに確かめること

- 宛先の綴り、とくに `/skills/*` と `/api/*` の `*` を確かめます。
- `APP_URL` が実際の URL と一致しているか（末尾に `/` が付いていないか）を確かめます。
- `ACCESS_AUD` が、いま使っているアプリの AUD と一致しているか確かめます。
- Access のアプリを外した状態でも、`/oauth/authorize` と `/api/oauth-requests/*` は 401 になります。設定を外しても素通りしません。
- 公開した後の確かめ方は [deploy.md](./deploy.md) にあります。

## 5. メンバーを出し入れする

使える人を増やす・減らすときは、このアプリのポリシーだけを変えます。
hikidashi 側に利用者の一覧は持たないので、ほかに変える場所はありません。

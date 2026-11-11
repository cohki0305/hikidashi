# Cloudflare Access で hikidashi を守る

hikidashi は、社内のメンバーだけが使えるサービスです。入口の本人確認は Cloudflare Access に任せます。
この手順では、ドメイン全体を Access で守り、Claude とのつなぎに必要な道だけを例外にします。

## 1. アプリを作る

1. Cloudflare の管理画面で「Access」→「Applications」を開きます。
2. 「Add an application」から「Self-hosted」を選びます。
3. アプリの名前を「hikidashi」にします。
4. 対象のドメインを、hikidashi のドメイン全体にします（例: `hikidashi.example.com` と `hikidashi.example.com/*`）。
5. ログイン方法と、許可するメンバー（メールアドレスやグループ）を決めます。

## 2. 例外にする道

次の道だけを Bypass（Access を通さない）にします。Claude が hikidashi と話すために、ブラウザのログインを挟まずに呼ぶ道です。

- `/mcp`
- `/oauth/register`
- `/oauth/token`
- `/.well-known/*`

Bypass の設定は、アプリの「Bypass」のポリシーに、上の道を 1 つずつ追加します。
`/.well-known/*` は、Claude が「どこに許可を聞けばよいか」を知るための案内です。

## 3. Bypass にしない道

次の道は Bypass にしないでください。ここは、つないでよい人を hikidashi 自身が確かめる場所です。

- `/oauth/authorize`
- `/authorize`

`/oauth/authorize` は、Claude からのつなぐ頼みを受けて、許可の画面へ送る道です。
`/authorize` は、実際に「つなぐ」「やめる」を選ぶ画面です。
この 2 つを Bypass にすると、誰でも許可の画面を開けてしまい、本人確認ができなくなります。
Access を通したうえで、hikidashi がログイン中のメールアドレスを使って許可を記録します。

## 4. 設定の確認

- `APP_URL` に hikidashi の URL（末尾の `/` なし）を設定します。未設定のあいだは、OAuth と MCP の入口は 404 になります。
- Access のアプリを外した状態でも、`/oauth/authorize` と `/api/oauth-requests/*` は 401 になります。設定を外しても素通りしません。
- つながらないときは、Bypass の道の綴り（`/.well-known/*` の `*` を忘れていないか）と、`APP_URL` の値を確かめます。

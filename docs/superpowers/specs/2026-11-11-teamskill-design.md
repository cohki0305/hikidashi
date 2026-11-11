# hikidashi 設計書

> 「手本」は品質ゲートの持ち込み元にした社内の別リポジトリを指す。場所は実装の指示書でだけ渡し、このリポジトリには名前もパスも書かない。

2026-11-11 / 対象リポジトリ: `~/teamskill`（新規）

## 1. 何のために作るか

社内のコンサルチームでは、エンジニアが作った Claude スキルが private リポジトリに置かれている。非エンジニアのメンバーは GitHub を使わないので、今はそのスキルを受け取れない。

hikidashi（引き出し）は、スキルの受け渡しを **Claude との会話だけ** で済ませるための社内向けサービス。自分たちでホスティングし、自分たちだけで使う。

- 作る人: Claude に「このスキルをチームに公開して」と頼むと、カスタムコネクタ（MCP）経由でスキルが登録される。
- 使う人: claude.ai でも Claude Code でも同じカスタムコネクタをつなぎ、「チームのスキル『〇〇』を入れて」と頼むと手元に入る。
- 更新: 会話の始めに Claude が古いスキルを見つけて知らせ、本人が同意したら入れ直す。

更新の判定は「入れたスキルの横に目印ファイル（名前・版・指紋）を置き、会話の始めに Claude がそれをサーバーに渡して比べる」方式にする。

## 2. ゴール・やらないこと

### ゴール
- 非エンジニアが GitHub に触れず、claude.ai / Claude Code の両方でチームのスキルを手元に入れられる。
- スキルはフォルダ単位で扱う。テキストだけでなく、動画素材・画像・音声・テンプレートなどのバイナリやサブフォルダも入れられる（動画編集のスキルを想定）。
- 版を残し、古いスキルを入れている人に会話の始めで知らせる。
- 手本リポジトリと同じ品質ゲート（biome・dependency-cruiser・カスタム lint・tsc・bun:test）を **最初に** 入れてから機能を作る。

### やらないこと（今回）
- 細かい権限（役割・承認フロー・スキルごとの公開範囲）。ログインできた人は全員が全スキルを読め、登録・更新もできる。
- 外部販売・料金・公開ディレクトリ。
- Web 画面からの編集・削除。削除が必要なら運用者が手作業で行う。
- Claude 以外のツール（Cursor・Copilot など）への配布。

### 失敗とみなすもの
- 非エンジニアが入れ方に迷って結局エンジニアに頼む（画面とツールの説明が技術用語だらけ、など）。
- 許可していない人がスキルを取れる。
- 入れたスキルを本人の同意なしに上書きする。

## 3. 決まっている構成

| 項目 | 決定 | 決めた人 |
|---|---|---|
| 実行環境 | Cloudflare Workers ＋ Hono（API・MCP）＋ React（Vite・TanStack Router / Query）。1 つの Worker が画面の静的ファイルも配る | 利用者（「手本と同じ構成」） |
| 品質ゲート | 手本リポジトリの biome・dependency-cruiser・lefthook・カスタム lint 単一ランナーを持ち込む | 利用者 |
| ログイン | Cloudflare Access。許可するメールアドレスは Access のポリシーに並べる。メンバーは全員 Google アカウントを持っているので Google ログイン（Access のメールコードも可） | 利用者 |
| 権限 | ログインできれば全員同じ | 利用者 |
| 登録の経路 | Claude から MCP 経由だけ。Web 画面は読むだけ | 利用者（モック承認） |
| 入れ方 | Claude Code は Claude が `~/.claude/skills/<name>/` に展開。claude.ai は zip を受け取り「設定 › 機能 › スキル」からアップロード | 利用者 |
| 画面 | Artifact のモック 3 枚（一覧・詳細・つなぎ方）https://claude.ai/artifact/FAJhULZnQc6WJyaZUdFv2r | 利用者承認済み |
| データ | D1（メタデータ）＋ R2（スキル本体の zip） | **私の判断**（下記） |
| Cloudflare アカウント | cohki0305。ドメインは issue 5 までに決める（アカウントにあるゾーンから選ぶ） | 利用者（アカウント） |
| サービス名 | hikidashi（引き出し）。リポジトリのフォルダは `~/teamskill` のまま | 利用者 |

**D1 にした理由（私の判断）**: 手本は Postgres（Hyperdrive）だが、社内の数人が使う規模で DB サーバーを別に持つ理由がない。D1 なら Worker と同じ wrangler だけで完結する。drizzle は D1 でも使えるので、手本の drizzle 系 lint は対象の語彙だけ D1 用に直して使う。

## 4. 実装役の割り当て

pipeline（`~/agent-pipeline`）で issue ごとに回す。実装役はリポジトリの `.agent-pipeline.local.json` の `implementAgent` で決まり、実行ごとの上書きはできない。

- **画面（UI）の issue**: `claudeSonnet`（Sonnet 5.5）
- **それ以外（土台・lint・API・MCP・ログイン）**: `deepseekFlash`（opencode）
- 設計・レビューは既定どおり（Opus 5.5）

切り替えは pipeline を起動する直前に `implementAgent` を書き換える。同時に走らせる場合は、起動時に読まれた値で固定されるかを最初に確かめる（確かめられなければ順に起動する）。

## 5. 中身の設計

### 5.1 スキルの形

- 1 スキル = 1 フォルダ。直下に `SKILL.md`（frontmatter に `name`・`description`）が必須。ほかのファイル・サブフォルダは自由で、バイナリも可。
- スキルの識別子は `SKILL.md` の `name`（英小文字・数字・`-`）。同じ `name` で公開し直すと新しい版になる。誰が公開しても同じ（権限は分けない）。
- 画面に出す名前と説明は `SKILL.md` の `description` を使う。日本語の表示名が要るなら frontmatter に任意で `title` を置けるようにする（なければ `name`）。
- 版は 1, 2, 3… の連番。版ごとに zip を丸ごと R2 に保存し、上書きしない。
- 指紋（fingerprint）は「全ファイルのパスと内容から作る SHA-256」。zip の圧縮方法で変わらないよう、zip そのもののハッシュにはしない。

### 5.2 データ

D1:
- `skills`: id, name（一意）, title, description, latest_version, created_at, updated_at
- `skill_versions`: id, skill_id, version, fingerprint, size_bytes, file_count, note（変更点）, published_by（メール）, r2_key, created_at
- `skill_files`: version_id, path, size_bytes, is_text（画面のファイル一覧とプレビュー用。中身は持たない）
- `uploads`: id, r2_key, created_by, expires_at, status（公開途中の受け皿。§5.4）

R2: `versions/<skill_id>/<version>.zip`、公開途中は `uploads/<upload_id>.zip`。

### 5.3 MCP ツール

`/mcp`（Streamable HTTP）。認証は §5.6。ツールの説明文は非エンジニアが読んでも分かる日本語にする。

| ツール | 何をするか |
|---|---|
| `list_skills(query?)` | 名前・説明で探す。name, title, description, latest_version, updated_at を返す |
| `install_skill(name)` | 最新版の zip の **一時ダウンロード URL（10 分有効）**、版、指紋、入れ方の案内を返す。Claude Code では Claude が URL から取得し `~/.claude/skills/<name>/` に展開して、同じ場所に目印 `.hikidashi.json`（name・version・fingerprint）を書く。claude.ai では利用者に URL を渡して設定画面からアップロードしてもらう |
| `check_skill_updates(installed[])` | 目印の一覧を受け取り、`up_to_date` / `update_available` を返す。説明文に「会話の始めに `~/.claude/skills/*/.hikidashi.json` を読んで渡す」「勝手に上書きせず同意を得る」と書く。**更新の知らせは Claude Code だけ**（私の判断。claude.ai には読める目印がないので、claude.ai の人は一覧の更新日で気づく） |
| `begin_publish()` | 公開の受け皿を作り、**一時アップロード URL（R2 の署名付き PUT・30 分有効）** と upload_id を返す。説明文に手順を書く: スキルのフォルダを zip にし、`curl -T` でその URL へ送る |
| `finish_publish(upload_id, note?)` | アップロードされた zip を検査して新しい版として登録する。結果（name・版・ファイル数・サイズ）を返す |

バイナリやフォルダを含むので、ファイルの中身を MCP のやりとりに載せない。出し入れは必ず一時 URL 経由の zip にする。

**公開は Claude Code 専用**（利用者決定）。claude.ai のコード実行環境からは外へ zip を送れないため。claude.ai は「探す・入れる」だけ。

**大きいスキルは Claude Code 専用**（利用者決定）。claude.ai のスキルのアップロード上限を超える版は、一覧と詳細に「Claude Code 専用」と出し、`install_skill` も claude.ai 向けの案内を出さない。上限の値は issue 4 で実際に確かめて設定値にする。

### 5.4 公開時の検査（`finish_publish`）

- zip の直下（または唯一のトップフォルダの直下）に `SKILL.md` があり、frontmatter の `name` が規則に合う。
- パスに `..`、絶対パス、シンボリックリンクがない。
- 上限: 1 版の zip は 100MB くらいを想定（利用者決定）。上限は 200MB・ファイル数 1,000 にして余裕を持たせる（私の判断）。
- **Worker のメモリ（128MB）に zip 全体を載せない**。zip 本体は Worker を通さず R2 へ直接 PUT される（§5.7）。検査は R2 の範囲読み出しで行う: 末尾の central directory を読んでパス一覧とサイズを取り、各ファイルは範囲読み出し → `DecompressionStream("deflate-raw")` → `crypto.DigestStream("SHA-256")` と流して 1 ファイルずつ指紋を取る。指紋は「パスで並べた (path, sha256) の一覧」の SHA-256。
- 100MB の zip で Worker の CPU 時間・メモリに収まることを、issue 4 で実測して確かめる。収まらない場合は指紋の計算を Claude 側（公開時にローカルで計算して渡す）に移し、サーバーはファイル一覧の検査だけにする。
- 指紋が最新版と同じなら新しい版を作らず「変更なし」と返す。
- 通れば `versions/` に移し、D1 に版とファイル一覧を書く。受け皿は期限切れのものを定期的に消す（Cron Trigger）。

### 5.5 Web 画面と API

モックどおりの 3 画面（一覧・詳細・つなぎ方）。モックの HTML は `docs/design/mock/`（`Main.dc.html`＝一覧、`Detail.dc.html`＝詳細、`Connect.dc.html`＝つなぎ方）に置いた。並べる項目・文言・色・余白はこれに合わせる（`<x-dc>` や `{{}}` はモック用の記法なので、React に書き直す）。モックからの変更点は 1 つ:
- 詳細のファイル表示は「フォルダの木＋サイズ」を基本にし、テキスト（.md・.txt・.json など小さいもの）だけ中身を表示する。バイナリは名前とサイズだけ出す。

API（Hono、REST、`shared/` に zod のスキーマを置き画面と共有する。持ち込む lint:api-contract・route-rest の規約に従う）:
- `GET /api/skills?query=`
- `GET /api/skills/:name`（最新版、ファイル一覧、版の履歴）
- `GET /api/skills/:name/versions/:version/files/*`（テキストのプレビュー。サイズ上限あり）
- `GET /api/skills/:name/versions/:version/download`（zip）
- `GET /api/me`（ログイン中のメール。ヘッダー表示用）

### 5.6 ログイン

- **Web と API**: Cloudflare Access の self-hosted アプリでドメイン全体を守る。Worker 側でも `Cf-Access-Jwt-Assertion` を検証し、メールを取り出す（Access を外した設定ミスで素通りにならないように）。
- **MCP**: claude.ai のカスタムコネクタは OAuth を通るので、`@cloudflare/workers-oauth-provider` で Worker を OAuth サーバーにし、本人確認は Access（Access for SaaS の OIDC アプリ）に任せる。Cloudflare が案内している「Access で MCP サーバーを守る」構成。`/mcp`・`/authorize`・`/token`・`/register`・`/.well-known/*` は Access のアプリから外す（OAuth のトークンで守る。zip の出し入れは R2 の署名付き URL なので Worker のドメインを通らない）。
- 許可するメンバーの追加・削除は Access のポリシーだけで行い、アプリに利用者テーブルは持たない。
- **最初の issue で検証すること**: claude.ai のカスタムコネクタと Claude Code の両方から、この構成で接続・ツール呼び出しができるか。だめなら代わりの案（Worker 自前の Google OAuth ＋許可メール一覧）に切り替える。

### 5.7 一時 URL

- Worker の本文上限（100MB）とメモリを避けるため、**zip の出し入れは R2 の S3 互換の署名付き URL** で直接行う（ダウンロードは GET 10 分、アップロードは PUT 30 分。`aws4fetch` などで Worker 内で署名する）。
- アップロード先は `uploads/<upload_id>.zip` に固定し、`finish_publish` が済んだら `uploads.status` を使用済みにする。期限切れの受け皿は Cron で消す。
- R2 のアクセスキーは Worker のシークレット。Web 画面の zip ダウンロード（§5.5）も同じ署名付き URL へリダイレクトする。

## 6. 品質ゲート（最初の issue）

手本リポジトリから次を持ち込み、hikidashi の構成に合わせて直す。

- `biome.json`、`.dependency-cruiser.cjs`（`extension/` 関連の規則は削る）、`lefthook.yml`、`tsconfig.json` の path alias（`@/`）。
- `scripts/lint-runner.ts`・`scripts/lib/`（runner-engine・registry・ast）と各ルール。
  - そのまま使う: api-contract, boundary, derived-types, docs-refs, drift, hono-style, import-alias, layer-class, lib-layout, no-bun-runtime, no-fixture-runtime-import, no-route-type-cast, no-throw, no-type-program, repo-single-table, route-rest, schema-location, services, test-colocate
  - D1 用に直す: db-access（postgres-js の語彙 → D1 / drizzle-d1）、drizzle-migrations（D1 のマイグレーション置き場に合わせる）
  - 持ち込まない: no-legacy-names・no-input-value（手本固有の事情のためのルール）
- 各ルールのテストも一緒に持ち込み、hikidashi で通ることを確かめる。
- `package.json` の `lint:all`・`typecheck`・`test` と、pipeline 用の `.agent-pipeline.json`（commands は lint:all・typecheck・test）。
- `CLAUDE.md` に依存の向き（API → Service → Repository → DB、例外を投げず Result を返す）と、画面文言は非エンジニアの言葉で書くことを書く。

この issue では機能はつくらず、Hono の最小の Worker（`/api/health`）と空の React 画面だけで全ゲートが通る状態にする。

## 7. issue の分け方と順番

1. **土台＋品質ゲート**（opencode）: §6。あわせて `shared/` に API の zod スキーマ（§5.5 の応答の形）を先に定義する。これで 2 と 3 を並行できる。
2. **画面**（Sonnet）: モック 3 枚を React で作る。API は 1 のスキーマどおりの偽の応答で動かす。偽の応答は `app/dev-mocks/` に置き、`vite dev` のときだけ読み込む（本番ビルドに入らないことをテストで確かめる。no-fixture-runtime-import の対象外にするのはこのフォルダだけ）。完了条件はテストに加え、ブラウザで 3 画面を開いてスクショで確かめるところまで（私の判断）。
3. **D1・R2・Web API**（opencode）: §5.2、§5.5 の API、Access の JWT 検証。
4. **MCP とログイン**（opencode）: §5.3、§5.4、§5.6、§5.7。先に接続の検証（§5.6 最後）をする。
5. **つなぎ込みと本番デプロイ**（opencode）: 画面を本物の API に向け、Access の設定手順を `docs/runbooks/` に書き、本番で claude.ai・Claude Code の両方から「探す・入れる・公開する・更新を知る」を確かめる。

2 と 3 は 1 の後に並行で走らせる。

## 8. 実装役に任せること

- ディレクトリ構成の細部、ライブラリの選択（zip は fflate を想定）、テストの書き方。
- 画面の細部（モックに沿っていれば足し引きはよい。ただし説明文を足しすぎない）。
- 一時 URL のトークン形式、Cron の間隔。

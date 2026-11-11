# 手元で動かす

スキル API を、手元の D1・R2（`--local`）とサンプルデータで動かす手順。

## 準備

```sh
bun install
cp .dev.vars.example .dev.vars
```

`.dev.vars` には `APP_ENV=development` と `DEV_ACCESS_EMAIL=dev@example.com` が入っている。
Wrangler はプロセスの環境変数を Worker に渡さないため、この 2 つは `.dev.vars` に置く。
本番では `APP_ENV` を設定しない（Cloudflare Access の JWT を検証する）。

## データを入れる

```sh
bun run dev:seed
```

`wrangler d1 migrations apply hikidashi --local` でマイグレーションを当ててから、本番と同じ D1・R2 の束縛へ 3 件のスキルを入れる。

- `code-review`: 2 版。`SKILL.md` と `references/checklist.md`
- `meeting-notes`: 1 版。`SKILL.md` と `references/template.md`
- `asset-bundle`: 1 版。`SKILL.md` とバイナリの `assets/sample.bin`

データは `.wrangler/state/v3` に残る。同じ名前が既にあれば飛ばすので、何度実行しても増えない。
まっさらな状態から入れ直すときは `.wrangler/state/v3` を消してから実行する。

## 起動

```sh
bun run build
bun run dev:server
```

`http://localhost:8787` で待ち受ける。画面を配る設定なので、先にビルドしておく。

## API を叩く

`DEV_ACCESS_EMAIL` の人が本人として通る。

```sh
curl http://localhost:8787/api/me
curl "http://localhost:8787/api/skills"
curl http://localhost:8787/api/skills/code-review
curl "http://localhost:8787/api/skills/code-review/versions/1/files?path=SKILL.md"
curl -D - -o /tmp/code-review-v1.zip \
  http://localhost:8787/api/skills/code-review/versions/1/download
```

- 一覧と詳細は JSON。
- プレビューは `text/plain; charset=utf-8` でファイルの中身。
- ダウンロードは `application/zip` と `Content-Disposition: attachment; filename="code-review-v1.zip"`。
- `asset-bundle` の `assets/sample.bin` は `is_text` でないため、プレビューは 404。

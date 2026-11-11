# scripts

独自 lint とその部品。lint は 1 つのランナー（`bun run lint:custom`）で、ファイルごとに oxc-parser で 1 回だけ解析して全ルールに渡す。

## ルールの足し方

1. `scripts/lint-{name}.test.ts` を先に書く。
2. `scripts/lint-{name}.ts` に `FILE_RULE`（`FileRule`）と `RUNNER_FIX`（直し方の 1 行）を export する。AST が要るなら `ast: true`。対象が 0 件でも落とさないなら `optional: true`。
3. `scripts/lib/lint-registry.ts` の `LINT_REGISTRY` に `fileRule("lint:{name}", "{name}", module)` を足す。ファイル群全体を見るルールは `projectRule` を使う。
4. `package.json` に `lint:{name}` を足す。lefthook に個別 job は足さない。

## テストの必須パターン

- 違反例で検出されること。別名 import・動的 import・type import 混在など複数の書き方を含める。
- 正例で 0 件であること。

## 禁止

- lint のコードで `typescript` パッケージや型情報（`createProgram` `getTypeChecker`）を使わない。oxc-parser の AST（`scripts/lib/lint-ast.ts` の `parseTypeScript` `forEachChild` `lineOf` `isTypeOnlyImport`）と文字列だけで判定する（`lint:no-type-program` が検査する）。
- 文書に書くコマンド参照（bun run に続く名前）は実在する script だけにする（`lint:docs-refs` が検査する）。

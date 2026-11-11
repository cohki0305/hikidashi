/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ===== 画面とサーバーの実行時境界 =====
    {
      name: "client-cannot-runtime-import-server",
      comment: "画面（app/）はサーバーの型だけを import できる。実行時の呼び出しは API 経由",
      severity: "error",
      from: { path: "^app/" },
      to: { path: "^server/", dependencyTypesNot: ["type-only"] }
    },
    {
      name: "server-cannot-runtime-import-client",
      comment: "サーバーは画面（app/）に依存できない",
      severity: "error",
      from: { path: "^server/" },
      to: { path: "^app/" }
    },
    {
      name: "shared-is-pure",
      comment:
        "shared/ は純粋に保つ。shared 自身と zod・テスト実行器（bun:test）以外（app・server・scripts・tests・npm パッケージ・Node 組み込み）に依存しない",
      severity: "error",
      from: { path: "^shared/" },
      to: { pathNot: "(^|/)node_modules/zod/|^shared/|^bun:test$" }
    },

    // ===== サーバーの層（API → Service → Repository → DB の一方向）=====
    {
      name: "api-cannot-import-data-layers",
      comment: "API 層はデータ層を直接参照できない（Service 経由で使う）",
      severity: "error",
      from: { path: "^server/api/" },
      to: { path: "^server/(repositories|db)/" }
    },
    {
      name: "handlers-no-service-runtime-import",
      comment: "handlers は Service を c.var から受け取る。型の import だけは可",
      severity: "error",
      from: { path: "^server/api/.+/handlers/" },
      to: { path: "^server/services/", dependencyTypesNot: ["type-only"] }
    },
    {
      name: "service-cannot-import-upper",
      comment: "Service は API・middleware に依存できない（逆依存禁止）",
      severity: "error",
      from: { path: "^server/services/" },
      to: { path: "^server/(api|middleware)/" }
    },
    {
      name: "data-layers-cannot-import-upper",
      comment: "repositories は上位層（api・services・middleware）に依存できない",
      severity: "error",
      from: { path: "^server/repositories/" },
      to: { path: "^server/(api|services|middleware)/" }
    },
    {
      name: "db-cannot-import-upper",
      comment: "db は上位層に依存できない",
      severity: "error",
      from: { path: "^server/db/" },
      to: { path: "^server/(api|services|repositories|middleware)/" }
    },
    {
      name: "middleware-cannot-import-business",
      comment: "middleware は認証・context 注入に集中し、業務層に依存しない",
      severity: "error",
      from: { path: "^server/middleware/" },
      to: { path: "^server/(services|repositories|api)/" }
    },
    {
      name: "schemas-cannot-import-business",
      comment:
        "Zod の schema（shared/schemas・server/schemas）は業務層（services・repositories・api・db）に依存しない",
      severity: "error",
      from: { path: "^(shared|server)/schemas/" },
      to: { path: "^server/(services|repositories|api|db)/" }
    },
    {
      name: "no-non-db-to-d1-driver",
      comment: "D1 ドライバ（drizzle-orm/d1）の生成は server/db に閉じ込める",
      severity: "error",
      from: { path: "^(?!server/db/)" },
      to: { path: "(^|/)node_modules/drizzle-orm/d1(/|$)" }
    },

    // ===== 画面の層 =====
    {
      name: "components-cannot-import-hooks",
      comment: "components/ はプレゼンテーショナルのみ。hooks の型の import だけは可",
      severity: "error",
      from: { path: "^app/components/" },
      to: { path: "^app/hooks/", dependencyTypesNot: ["type-only"] }
    },
    {
      name: "components-cannot-import-api-client",
      comment: "components/ は API クライアントを直接呼べない",
      severity: "error",
      from: { path: "^app/components/" },
      to: { path: "^app/lib/api\\.ts$" }
    },
    {
      name: "lib-cannot-import-components",
      comment: "app/lib は上位層（components）を見ない",
      severity: "error",
      from: { path: "^app/lib/" },
      to: { path: "^app/components/" }
    },

    // ===== 共通 =====
    {
      name: "no-circular",
      comment:
        "循環依存禁止。独自 lint の各ファイルは直接実行時だけ lint-runner を動的 import するため、lint-runner を経由する循環は除く",
      severity: "error",
      from: {},
      to: { circular: true, viaNot: "^scripts/lint-runner\\.ts$" }
    },
    {
      name: "no-prod-to-test",
      comment: "本番コードはテストファイルに依存できない",
      severity: "error",
      from: { pathNot: "\\.test\\.tsx?$" },
      to: { path: "\\.test\\.tsx?$" }
    },
    {
      name: "no-orphans",
      comment: "孤立モジュール検出",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+",
          "\\.d\\.ts$",
          "server/entry/",
          "app/main\\.tsx$",
          "app/routeTree\\.gen\\.ts$",
          "tests/preload\\.ts$"
        ]
      },
      to: {}
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // node_modules は doNotFollow で辿らないだけにする。exclude すると npm 依存が検査対象から消え、
    // shared-is-pure の npm 検査が効かなくなる。includeOnly も依存先（node_modules・Node 組み込み）
    // を絞り込んで依存の辺を消すため使わず、範囲は exclude と各ルールの from.path で限定する
    exclude: { path: "(routeTree\\.gen\\.ts|tests/fixtures)" },
    parser: "swc",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" }
  }
};

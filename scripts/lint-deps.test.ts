import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
let tmpRoot = "";

type Fixture = Record<string, string>;
type Violation = { from: string; rule: { name: string; severity: string } };
type CruiseResult = {
  summary: { error: number; violations: Violation[] };
  modules: { source: string; dependencies: { module: string; couldNotResolve: boolean }[] }[];
};

/**
 * fixture はテストの中で一時ディレクトリに作る。リポジトリに置かないので、
 * 手本の固有のパスや import を持ち込まずに済む。
 * キーは "{領域}/{ケース}" 形式で、同じパスのファイルが fixture 間でぶつからないよう
 * ファイル名の末尾に fixture ごとの印を付け、相対 import と @/ import もそれに合わせる。
 */
const FIXTURES: Record<string, Fixture> = {
  "client-server/violation": {
    "app/lib/a.ts": 'import { x } from "../../server/x";\nexport const a = x;\n',
    "server/x.ts": "export const x = 1;\n"
  },
  "client-server/violation-alias": {
    "app/lib/a.ts": 'import { x } from "@/server/x";\nexport const a = x;\n',
    "server/x.ts": "export const x = 1;\n"
  },
  "client-server/allowed": {
    "app/lib/a.ts": 'import type { X } from "../../server/x";\nexport type A = X;\n',
    "server/x.ts": "export type X = number;\n"
  },
  "server-client/violation": {
    "app/x.ts": "export const x = 1;\n",
    "server/a.ts": 'import { x } from "../app/x";\nexport const a = x;\n'
  },
  "shared-pure/allowed": {
    "shared/a.ts": 'import { z } from "zod";\nexport const a = z.string();\n'
  },
  "shared-pure/violation": {
    "shared/a.ts": 'import { Hono } from "hono";\nexport const a = Hono;\n'
  },
  "shared-pure/node-builtin": {
    "shared/a.ts": 'import { readFileSync } from "node:fs";\nexport const a = readFileSync;\n'
  },
  "layers/api-to-repo": {
    "server/api/a.ts": 'import { r } from "../repositories/r";\nexport const a = r;\n',
    "server/repositories/r.ts": "export const r = 1;\n"
  },
  "layers/service-to-api": {
    "server/api/a.ts": "export const a = 1;\n",
    "server/services/s.ts": 'import { a } from "../api/a";\nexport const s = a;\n'
  },
  "layers/schema-to-service": {
    "server/schemas/a.ts": 'import { s } from "../services/s";\nexport const a = s;\n',
    "server/services/s.ts": "export const s = 1;\n"
  },
  "layers/schema-to-db": {
    "server/schemas/a.ts": 'import { d } from "../db/d";\nexport const a = d;\n',
    "server/db/d.ts": "export const d = 1;\n"
  },
  "layers/schema-to-lib": {
    "server/schemas/a.ts": 'import { l } from "../lib/l";\nexport const a = l;\n',
    "server/lib/l.ts": "export const l = 1;\n"
  },
  "layers/non-repo-to-db-driver": {
    "server/services/s.ts": 'import { drizzle } from "drizzle-orm/d1";\nexport const s = drizzle;\n'
  },
  "layers/db-driver": {
    "server/db/d.ts": 'import { drizzle } from "drizzle-orm/d1";\nexport const d = drizzle;\n'
  },
  "circular/violation": {
    "app/lib/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
    "app/lib/b.ts": 'import { a } from "./a";\nexport const b = a;\n'
  }
};

const errorsByFixture = new Map<string, string[]>();

/** 相対 import と @/ import の末尾に fixture の印を足す。.ts と二重引用符の from だけが対象。 */
function markImports(source: string, mark: string): string {
  return source.replace(
    /(from\s+")((?:\.{1,2}\/|@\/)[^"]+)(")/g,
    (_m, head: string, spec: string, tail: string) => `${head}${spec}__${mark}${tail}`
  );
}

function placeFixture(dir: string, name: string, mark: string): void {
  const files = FIXTURES[name];
  if (!files) throw new Error(`fixture が定義されていない: ${name}`);
  let placed = 0;
  for (const [rel, source] of Object.entries(files)) {
    if (!rel.endsWith(".ts"))
      throw new Error(`fixture に .ts 以外のファイルがある: ${name}/${rel}`);
    const dest = join(dir, rel.replace(/\.ts$/, `__${mark}.ts`));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, markImports(source, mark));
    placed++;
  }
  if (placed === 0) throw new Error(`fixture にモジュールが 1 件もない: ${name}`);
}

/** fixture が import する npm 依存を、解決だけできる最小のスタブとして置く。 */
function placeNpmStubs(dir: string): void {
  const files: [string, string][] = [
    [
      "node_modules/hono/package.json",
      JSON.stringify({ name: "hono", version: "0.0.0", main: "index.ts" })
    ],
    ["node_modules/hono/index.ts", "export const Hono = 1;\n"],
    [
      "node_modules/zod/package.json",
      JSON.stringify({ name: "zod", version: "0.0.0", main: "index.ts" })
    ],
    ["node_modules/zod/index.ts", "export const z = { string: () => 1 };\n"],
    [
      "node_modules/drizzle-orm/package.json",
      JSON.stringify({ name: "drizzle-orm", version: "0.0.0" })
    ],
    ["node_modules/drizzle-orm/d1/index.ts", "export const drizzle = 1;\n"]
  ];
  for (const [file, source] of files) {
    const dest = join(dir, file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, source);
  }
}

// depcruise は起動と解析に数秒かかり、既定の 5 秒では足りないことがある
beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "deps-"));
  const fixtures = Object.keys(FIXTURES);
  for (const [i, name] of fixtures.entries()) placeFixture(tmpRoot, name, `f${i}`);
  cpSync(join(root, "tsconfig.json"), join(tmpRoot, "tsconfig.json"));
  placeNpmStubs(tmpRoot);

  const result = Bun.spawnSync(
    [
      join(root, "node_modules/.bin/depcruise"),
      "--config",
      join(root, ".dependency-cruiser.cjs"),
      "--output-type",
      "json",
      "."
    ],
    { cwd: tmpRoot }
  );
  let cruise: CruiseResult;
  try {
    cruise = JSON.parse(result.stdout.toString()) as CruiseResult;
  } catch (error) {
    throw new Error(
      `depcruise の出力を解析できない: ${String(error)}\n${result.stderr.toString()}`
    );
  }
  const violations = cruise.summary.violations;
  // json 出力の終了コードは違反数によらず 0 なので、0 以外やシグナル終了は実行の失敗として扱い、
  // 集計（summary.error）と違反の一覧が食い違っていないことも確かめる
  const errorCount = violations.filter((v) => v.rule.severity === "error").length;
  if (result.signalCode != null || result.exitCode !== 0 || cruise.summary.error !== errorCount) {
    throw new Error(
      `depcruise が異常終了した: exit=${result.exitCode} signal=${result.signalCode} error=${cruise.summary.error} 違反=${errorCount}\n${result.stderr.toString()}`
    );
  }
  // 解決できない import があると辺が消えて検査が黙って弱くなる
  const unresolved = cruise.modules.flatMap((m) =>
    m.dependencies.filter((d) => d.couldNotResolve).map((d) => `${m.source} -> ${d.module}`)
  );
  if (unresolved.length > 0)
    throw new Error(`解決できない import がある:\n${unresolved.join("\n")}`);
  for (const [i, name] of fixtures.entries()) {
    const mark = `__f${i}.ts`;
    errorsByFixture.set(
      name,
      violations
        .filter((v) => v.rule.severity === "error" && v.from.endsWith(mark))
        .map((v) => v.rule.name)
    );
  }
}, 30000);

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

const errorsOf = (fixture: string): string[] => {
  const errors = errorsByFixture.get(fixture);
  if (!errors) throw new Error(`fixture が見つからない: ${fixture}`);
  return errors;
};

describe("dependency-cruiser の境界ルール", () => {
  test("app が server を値 import すると違反", () => {
    expect(errorsOf("client-server/violation")).toEqual(["client-cannot-runtime-import-server"]);
  });

  test("app から @/server の値 import の違反を検出する（tsconfig の paths が解決される）", () => {
    expect(errorsOf("client-server/violation-alias")).toEqual([
      "client-cannot-runtime-import-server"
    ]);
  });

  test("app から server の型だけの import は違反にならない", () => {
    expect(errorsOf("client-server/allowed")).toEqual([]);
  });

  test("server から app の import の違反を検出する", () => {
    expect(errorsOf("server-client/violation")).toEqual(["server-cannot-runtime-import-client"]);
  });

  test("shared が zod 以外の npm を import する違反を検出する", () => {
    expect(errorsOf("shared-pure/violation")).toEqual(["shared-is-pure"]);
  });

  test("shared が zod だけを import するのは違反にならない", () => {
    expect(errorsOf("shared-pure/allowed")).toEqual([]);
  });

  test("shared が Node の組み込みモジュールを import する違反を検出する", () => {
    expect(errorsOf("shared-pure/node-builtin")).toEqual(["shared-is-pure"]);
  });

  test("server/api から server/repositories の値 import の違反を検出する", () => {
    expect(errorsOf("layers/api-to-repo")).toEqual(["api-cannot-import-data-layers"]);
  });

  test("server/services から server/api の値 import の違反を検出する", () => {
    expect(errorsOf("layers/service-to-api")).toEqual(["service-cannot-import-upper"]);
  });

  test("server/schemas から server/services の import の違反を検出する", () => {
    expect(errorsOf("layers/schema-to-service")).toEqual(["schemas-cannot-import-business"]);
  });

  test("server/schemas から server/db の import の違反を検出する", () => {
    expect(errorsOf("layers/schema-to-db")).toEqual(["schemas-cannot-import-business"]);
  });

  test("server/schemas から server/lib の import は違反にならない", () => {
    expect(errorsOf("layers/schema-to-lib")).toEqual([]);
  });

  test("server/services が drizzle-orm/d1 を import すると違反", () => {
    expect(errorsOf("layers/non-repo-to-db-driver")).toEqual(["no-non-db-to-d1-driver"]);
  });

  test("server/db から drizzle-orm/d1 を import するのは違反にならない", () => {
    expect(errorsOf("layers/db-driver")).toEqual([]);
  });

  test("循環依存の違反を検出する", () => {
    expect(errorsOf("circular/violation")).toContain("no-circular");
  });
});

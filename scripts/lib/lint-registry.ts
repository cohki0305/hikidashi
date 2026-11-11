import * as apiContract from "@/scripts/lint-api-contract";
import * as boundary from "@/scripts/lint-boundary";
import * as dbAccess from "@/scripts/lint-db-access";
import * as derivedTypes from "@/scripts/lint-derived-types";
import * as docsRefs from "@/scripts/lint-docs-refs";
import * as drift from "@/scripts/lint-drift";
import * as drizzleMigrations from "@/scripts/lint-drizzle-migrations";
import * as honoStyle from "@/scripts/lint-hono-style";
import * as importAlias from "@/scripts/lint-import-alias";
import * as layerClass from "@/scripts/lint-layer-class";
import * as libLayout from "@/scripts/lint-lib-layout";
import * as noBunRuntime from "@/scripts/lint-no-bun-runtime";
import * as noFixtureRuntimeImport from "@/scripts/lint-no-fixture-runtime-import";
import * as noRouteTypeCast from "@/scripts/lint-no-route-type-cast";
import * as noThrow from "@/scripts/lint-no-throw";
import * as noTypeProgram from "@/scripts/lint-no-type-program";
import * as repoSingleTable from "@/scripts/lint-repo-single-table";
import * as routeRest from "@/scripts/lint-route-rest";
import * as schemaLocation from "@/scripts/lint-schema-location";
import * as services from "@/scripts/lint-services";
import * as testColocate from "@/scripts/lint-test-colocate";
import type { FileRule } from "./lint-runner-engine";

export type RunnerContext = {
  cwd: string;
  files: readonly string[];
  read: (file: string) => string;
};
export type RuleExecution = {
  checks?: FileRule[];
  finish?: () => readonly object[] | Promise<readonly object[] | undefined> | undefined;
};
export type RunnerRule = {
  name: string;
  file: string;
  fix: string;
  create: (context: RunnerContext) => RuleExecution;
};
export function fileRule(
  name: string,
  file: string,
  module: { FILE_RULE: FileRule; RUNNER_FIX: string }
): RunnerRule {
  return {
    name,
    file: `scripts/lint-${file}.ts`,
    fix: module.RUNNER_FIX,
    create: () => ({ checks: [module.FILE_RULE] })
  };
}
export function projectRule(
  name: string,
  file: string,
  fix: string,
  create: RunnerRule["create"]
): RunnerRule {
  return { name, file: `scripts/lint-${file}.ts`, fix, create };
}
// ルールは issue ごとに足す。
export const LINT_REGISTRY: readonly RunnerRule[] = [
  fileRule("lint:boundary", "boundary", boundary),
  fileRule("lint:import-alias", "import-alias", importAlias),
  fileRule("lint:lib-layout", "lib-layout", libLayout),
  projectRule("lint:test-colocate", "test-colocate", testColocate.RUNNER_FIX, ({ files }) => ({
    checks: [testColocate.testColocateRule(files)]
  })),
  fileRule("lint:no-bun-runtime", "no-bun-runtime", noBunRuntime),
  fileRule("lint:no-fixture-runtime-import", "no-fixture-runtime-import", noFixtureRuntimeImport),
  fileRule("lint:derived-types", "derived-types", derivedTypes),
  fileRule("lint:no-type-program", "no-type-program", noTypeProgram),
  projectRule("lint:docs-refs", "docs-refs", docsRefs.RUNNER_FIX, docsRefs.docsRefsExecution),
  fileRule("lint:hono-style", "hono-style", honoStyle),
  fileRule("lint:route-rest", "route-rest", routeRest),
  fileRule("lint:api-contract", "api-contract", apiContract),
  fileRule("lint:layer-class", "layer-class", layerClass),
  fileRule("lint:services", "services", services),
  fileRule("lint:drift", "drift", drift),
  projectRule("lint:repo-single-table", "repo-single-table", repoSingleTable.RUNNER_FIX, () => ({
    checks: [repoSingleTable.repoSingleTableRule()]
  })),
  fileRule("lint:no-throw", "no-throw", noThrow),
  fileRule("lint:no-route-type-cast", "no-route-type-cast", noRouteTypeCast),
  fileRule("lint:schema-location", "schema-location", schemaLocation),
  fileRule("lint:db-access", "db-access", dbAccess),
  projectRule(
    "lint:drizzle-migrations",
    "drizzle-migrations",
    drizzleMigrations.RUNNER_FIX,
    drizzleMigrations.drizzleMigrationsExecution
  )
];

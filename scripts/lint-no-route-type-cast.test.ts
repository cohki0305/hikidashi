import { describe, expect, test } from "bun:test";
import { findRouteTypeCastViolations } from "./lint-no-route-type-cast";

describe("lint:no-route-type-cast", () => {
  test("createFileRoute の引数を as never で書き換えるとエラーにする", () => {
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.tsx",
        'export const Route = createFileRoute("/x" as never)({});'
      )
    ).toHaveLength(1);
  });

  test("createFileRoute の引数を as で書き換えるとエラーにする", () => {
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.tsx",
        'export const Route = createFileRoute("/x" as "/y")({});'
      )
    ).toHaveLength(1);
  });

  test("そのままの createFileRoute は通す", () => {
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.tsx",
        'export const Route = createFileRoute("/x")({});'
      )
    ).toEqual([]);
  });

  test("括弧で包んだ as・.ts の <never> 型アサーションもエラーにする", () => {
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.tsx",
        'export const Route = createFileRoute(("/x" as never))({});'
      )
    ).toHaveLength(1);
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.ts",
        'export const Route = createFileRoute(<never>"/x")({});'
      )
    ).toHaveLength(1);
  });

  test("別名で import した createFileRoute でもエラーにする", () => {
    expect(
      findRouteTypeCastViolations(
        "app/routes/skills.$name.tsx",
        'import { createFileRoute as cfr } from "@tanstack/react-router";\nexport const Route = cfr("/x" as never)({});'
      )
    ).toHaveLength(1);
  });
});

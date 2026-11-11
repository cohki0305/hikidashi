import { describe, expect, test } from "bun:test";
import { MISSING_CONFIG_MESSAGE } from "@/server/lib/mcp/json-rpc";
import { upstream } from "@/server/lib/result";
import { toMissingConfig } from "./missing-config";

describe("toMissingConfig", () => {
  test("missingConfig のときだけ管理者向けの文言に置き換える", () => {
    expect(
      toMissingConfig(upstream("R2 の S3 の設定が足りません", { missingConfig: true }))
    ).toEqual(upstream(MISSING_CONFIG_MESSAGE));
  });

  test("文言が同じでも missingConfig が無ければ置き換えない", () => {
    expect(toMissingConfig(upstream("R2 の S3 の設定が足りません"))).toBeNull();
  });

  test("missingConfig が true でなければ置き換えない", () => {
    expect(
      toMissingConfig(upstream("R2 の S3 の設定が足りません", { missingConfig: false }))
    ).toBeNull();
  });
});

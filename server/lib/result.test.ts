import { describe, expect, test } from "bun:test";
import { conflict, invalid, notFound, ok, type Result } from "./result";

describe("Result", () => {
  test("ok は値を包んで返す", () => {
    const result: Result<number> = ok(3);
    expect(result).toEqual({ ok: true, value: 3 });
  });

  test("失敗は kind と message を持ち、details は省ける", () => {
    expect(notFound("無い")).toEqual({ ok: false, kind: "not_found", message: "無い" });
    expect(invalid("不正", { field: "name" })).toEqual({
      ok: false,
      kind: "invalid",
      message: "不正",
      details: { field: "name" }
    });
    expect(conflict("競合")).toMatchObject({ ok: false, kind: "conflict" });
  });
});

import { describe, expect, test } from "bun:test";
import { skills } from "@/server/db/schema";
import { createDb } from "./index";

describe("createDb", () => {
  test("D1 の束縛から schema 付きの DB を組み立てる", () => {
    // drizzle は生成時に D1 を呼ばないため、中身の無い束縛で組み立てだけを確かめる。
    const db = createDb({} as D1Database);
    const query = db.select().from(skills).toSQL();
    expect(query.sql).toContain("select");
    expect(query.sql).toContain("skills");
  });
});

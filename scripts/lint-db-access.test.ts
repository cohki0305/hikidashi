import { describe, expect, test } from "bun:test";
import { FILE_RULE, findDbAccessViolations } from "./lint-db-access";

const api = "server/api/a/handlers/x.ts";

describe("lint:db-access", () => {
  test("drizzle ハンドルの呼び出しを検出する", () => {
    const src = `
db.select().from(t);
db.insert(t).values({});
db.update(t).set({});
db.delete(t);
db.execute(sql\`x\`);
db.transaction(async (tx) => {});
db.batch([]);
db.run(sql\`x\`);
db.prepare("x");
tx.select();
this.db.select();
c.var.db.select();
c.get("db").select();
a.db.select();
database.insert(t);
`;
    expect(findDbAccessViolations(api, src)).toHaveLength(15);
  });

  test("DB ハンドルでない呼び出しや exec は検出しない", () => {
    expect(findDbAccessViolations(api, "DB.exec('x');")).toEqual([]);
    expect(findDbAccessViolations(api, "db?.select();")).toHaveLength(1);
    expect(findDbAccessViolations(api, "db['select']();")).toHaveLength(1);
  });

  test("services で db.batch を呼ぶと違反", () => {
    expect(
      findDbAccessViolations("server/services/a-service/index.ts", "db.batch([]);")
    ).toHaveLength(1);
  });

  test("repositories で db.batch は許可", () => {
    expect(
      findDbAccessViolations("server/repositories/a-repository/index.ts", "db.batch([]);")
    ).toEqual([]);
  });

  test("別名に移した DB ハンドルも検出する", () => {
    const src = `
const client = c.var.db;
client.select();
const { db: conn } = c.var;
conn.execute();
const trx = db;
trx.insert(t);
`;
    expect(findDbAccessViolations(api, src)).toHaveLength(3);
  });

  test("server/db からの値 import と生成関数の戻り値呼び出しを検出する", () => {
    const src = `import { getDb } from "@/server/db";
getDb(c).select();`;
    expect(findDbAccessViolations(api, src)).toHaveLength(2);
  });

  test("server/db からの型だけの import は禁止しない", () => {
    const src = `import type { Database } from "@/server/db";\nconst x: Database = y;`;
    expect(findDbAccessViolations(api, src)).toEqual([]);
  });

  test("services など repositories 以外でも検出する", () => {
    expect(
      findDbAccessViolations("server/services/a-service/index.ts", "db.select();")
    ).toHaveLength(1);
  });

  test("repositories と db と テストは許可する", () => {
    expect(
      findDbAccessViolations("server/repositories/a-repository/index.ts", "db.select();")
    ).toEqual([]);
    expect(findDbAccessViolations("server/db/client.ts", "db.select();")).toEqual([]);
    expect(findDbAccessViolations("server/api/a/x.test.ts", "db.select();")).toEqual([]);
    expect(findDbAccessViolations("app/x.ts", "db.select();")).toEqual([]);
  });

  test("repository の同名メソッドや無関係な呼び出しは 0 件", () => {
    const src = `
repos.users.update(1, {});
users.select();
map.delete(1);
c.var.user.insert();
`;
    expect(findDbAccessViolations(api, src)).toEqual([]);
  });

  test("FILE_RULE の対象は server 配下のテスト以外", () => {
    expect(FILE_RULE.include instanceof RegExp && FILE_RULE.include.test("server/a/b.ts")).toBe(
      true
    );
    expect(FILE_RULE.exclude?.test("server/a/b.test.ts")).toBe(true);
  });
});

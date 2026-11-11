import { describe, expect, test } from "bun:test";
import { findDrizzleMigrationViolations } from "./lint-drizzle-migrations";

const ZERO = "00000000-0000-0000-0000-000000000000";
const tags = ["20260101000000_init", "20260102000000_next"];

function fixture(overrides: Record<string, string | null> = {}) {
  const files: Record<string, string> = {
    "drizzle/meta/_journal.json": JSON.stringify({
      entries: tags.map((tag, idx) => ({ idx, tag }))
    }),
    "drizzle/20260101000000_init.sql": "CREATE TABLE a (id int);",
    "drizzle/20260102000000_next.sql": "CREATE TABLE b (id int);",
    "drizzle/meta/20260101000000_snapshot.json": JSON.stringify({ id: "a", prevId: ZERO }),
    "drizzle/meta/20260102000000_snapshot.json": JSON.stringify({ id: "b", prevId: "a" })
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete files[k];
    else files[k] = v;
  }
  return files;
}
const rules = (files: Record<string, string>) =>
  findDrizzleMigrationViolations(Object.keys(files), (f) => files[f] ?? "").map((v) => v.rule);

describe("lint:drizzle-migrations", () => {
  test("整合した drizzle/ は通す", () => {
    expect(rules(fixture())).toEqual([]);
  });

  test("drizzle/ が無ければ何も見ない", () => {
    expect(rules({ "package.json": "{}" })).toEqual([]);
  });

  test("journal の連番の欠けを検出する", () => {
    const journal = JSON.stringify({
      entries: [
        { idx: 0, tag: tags[0] },
        { idx: 2, tag: tags[1] }
      ]
    });
    expect(rules(fixture({ "drizzle/meta/_journal.json": journal }))).toContain("journal-index");
  });

  test("when が journal の順に増えていなければ検出する（並べて作った PR が後から入ると本番で飛ばされる）", () => {
    const journal = (w0: number, w1: number) =>
      JSON.stringify({
        entries: [
          { idx: 0, tag: tags[0], when: w0 },
          { idx: 1, tag: tags[1], when: w1 }
        ]
      });
    expect(rules(fixture({ "drizzle/meta/_journal.json": journal(2, 1) }))).toContain(
      "journal-when"
    );
    expect(rules(fixture({ "drizzle/meta/_journal.json": journal(1, 1) }))).toContain(
      "journal-when"
    );
    expect(rules(fixture({ "drizzle/meta/_journal.json": journal(1, 2) }))).toEqual([]);
  });

  test("journal にあって sql / snapshot が無いものを検出する", () => {
    expect(rules(fixture({ "drizzle/20260102000000_next.sql": null }))).toContain("missing-sql");
    expect(rules(fixture({ "drizzle/meta/20260102000000_snapshot.json": null }))).toContain(
      "missing-snapshot"
    );
  });

  test("journal に無い sql / snapshot（孤児）を検出する", () => {
    expect(rules(fixture({ "drizzle/20260103000000_orphan.sql": "SELECT 1;" }))).toEqual([
      "orphan-sql"
    ]);
    expect(rules(fixture({ "drizzle/meta/20260103000000_snapshot.json": "{}" }))).toContain(
      "orphan-snapshot"
    );
  });

  test("空の SQL を検出する", () => {
    expect(rules(fixture({ "drizzle/20260102000000_next.sql": " \n" }))).toEqual(["empty-sql"]);
  });

  test("snapshot の鎖の切れを検出する", () => {
    const broken = JSON.stringify({ id: "b", prevId: "zzz" });
    expect(rules(fixture({ "drizzle/meta/20260102000000_snapshot.json": broken }))).toEqual([
      "snapshot-chain"
    ]);
    const badFirst = JSON.stringify({ id: "a", prevId: "x" });
    expect(rules(fixture({ "drizzle/meta/20260101000000_snapshot.json": badFirst }))).toContain(
      "snapshot-chain"
    );
  });

  test("壊れた journal を検出する", () => {
    expect(rules(fixture({ "drizzle/meta/_journal.json": "{" }))).toEqual(["invalid-json"]);
  });
});

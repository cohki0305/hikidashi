import { describe, expect, test } from "bun:test";
import { issuerOf } from "./issuer";

describe("issuerOf", () => {
  test("末尾の / を落とし、ほかは変えない", () => {
    expect(issuerOf("https://hikidashi.example.test/")).toBe("https://hikidashi.example.test");
    expect(issuerOf("https://hikidashi.example.test//")).toBe("https://hikidashi.example.test");
    expect(issuerOf("http://localhost:5471")).toBe("http://localhost:5471");
  });
});

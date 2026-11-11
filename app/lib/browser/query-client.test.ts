import { expect, test } from "bun:test";
import { createQueryClient } from "./query-client";

test("自動の再試行をしない窓口を作る", () => {
  const client = createQueryClient();
  expect(client.getDefaultOptions().queries?.retry).toBe(false);
});

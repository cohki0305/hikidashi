import { describe, expect, test } from "bun:test";
import * as health from "@/server/api/health/handlers/health";
import { healthRoutes } from "@/server/api/health/routes";

describe("healthRoutes", () => {
  test("GET /health が health.index を指す", () => {
    expect(healthRoutes.routes).toHaveLength(1);
    const [route] = healthRoutes.routes;
    expect(route?.method).toBe("GET");
    expect(route?.path).toBe("/health");
    expect(route?.handler).toBe(health.index[0]);
  });
});

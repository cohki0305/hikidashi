import { describe, expect, test } from "bun:test";
import { createFactory } from "hono/factory";
import { ok } from "@/server/lib/http";
import {
  isSafePreviewPath,
  parseVersion,
  pathSegments,
  provideSkillService,
  type SkillServicePort,
  type SkillsEnv,
  versionedSkillParams
} from "./context";

function buildApp(service?: SkillServicePort) {
  const factory = createFactory<SkillsEnv>();
  return factory
    .createApp()
    .use("*", provideSkillService(service))
    .get("/", (c) => ok(c, { hasService: c.get("skillService") !== undefined }));
}

describe("provideSkillService", () => {
  test("service を c.var に載せる", async () => {
    const service = {} as unknown as SkillServicePort;

    const response = await buildApp(service).request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasService: true });
  });

  test("service が無ければ入口を塞ぐ", async () => {
    const response = await buildApp().request("/");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });
});

describe("pathSegments", () => {
  test("空のセグメントを除いて分ける", () => {
    expect(pathSegments("/api/skills/team-skill")).toEqual(["api", "skills", "team-skill"]);
    expect(pathSegments("skills/team-skill/")).toEqual(["skills", "team-skill"]);
  });
});

describe("versionedSkillParams", () => {
  test("マウントの深さによらず末尾から名前と版を読む", () => {
    expect(versionedSkillParams("/api/skills/team-skill/versions/3/files")).toEqual({
      name: "team-skill",
      version: 3
    });
    expect(versionedSkillParams("/skills/team-skill/versions/3/download")).toEqual({
      name: "team-skill",
      version: 3
    });
  });

  test("版が数字でない・0 のときは null", () => {
    expect(versionedSkillParams("/api/skills/team-skill/versions/abc/files")).toBeNull();
    expect(versionedSkillParams("/api/skills/team-skill/versions/0/files")).toBeNull();
  });
});

describe("parseVersion", () => {
  test("1 以上の整数だけを受ける", () => {
    expect(parseVersion("1")).toBe(1);
    expect(parseVersion("42")).toBe(42);
    expect(parseVersion("0")).toBeNull();
    expect(parseVersion("01")).toBeNull();
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion("-1")).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });
});

describe("isSafePreviewPath", () => {
  test("スキル内の相対パスだけを通す", () => {
    expect(isSafePreviewPath("SKILL.md")).toBe(true);
    expect(isSafePreviewPath("scripts/run.md")).toBe(true);
    expect(isSafePreviewPath("../x")).toBe(false);
    expect(isSafePreviewPath("/x")).toBe(false);
    expect(isSafePreviewPath("a/../x")).toBe(false);
    expect(isSafePreviewPath("")).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { createApp } from "@/server/app";
import type { AccessVerifier } from "@/server/lib/access/verify-access-jwt";
import { forbidden, notFound, ok } from "@/server/lib/result";
import type { SkillDetailResponse, SkillSummary } from "@/shared/schemas/skills";
import type { SkillServicePort } from "./context";

const AUTH_HEADER = { "Cf-Access-Jwt-Assertion": "valid-jwt" };

const summary: SkillSummary = {
  name: "team-skill",
  title: "チームのスキル",
  description: "チームで使うスキルです",
  latestVersion: 2,
  updatedAt: "2026-11-11T10:00:00.000Z",
  author: "member@example.com",
  sizeBytes: 12345,
  claudeCodeOnly: false
};

const detail: SkillDetailResponse = {
  skill: summary,
  files: [{ path: "SKILL.md", sizeBytes: 12, isText: true }],
  versions: [
    {
      version: 2,
      note: "説明を更新",
      publishedBy: "member@example.com",
      createdAt: "2026-11-11T10:00:00.000Z",
      fingerprint: "abc123",
      sizeBytes: 2048,
      fileCount: 1
    }
  ]
};

type ServiceCall =
  | { method: "list"; query: string }
  | { method: "show"; name: string }
  | { method: "preview"; name: string; version: number; path: string }
  | { method: "download"; name: string; version: number };

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    }
  });
}

function fakeService() {
  const calls: ServiceCall[] = [];
  const service: SkillServicePort = {
    list: async (query) => {
      calls.push({ method: "list", query });
      return ok([summary]);
    },
    show: async (name) => {
      calls.push({ method: "show", name });
      return name === summary.name ? ok(detail) : notFound("スキルが見つかりません");
    },
    preview: async (name, version, path) => {
      calls.push({ method: "preview", name, version, path });
      if (name !== summary.name || version !== summary.latestVersion || path !== "SKILL.md")
        return notFound("プレビューできるファイルではありません");
      return ok("# 見本のスキル\n");
    },
    download: async (name, version) => {
      calls.push({ method: "download", name, version });
      if (name !== summary.name || version !== summary.latestVersion)
        return notFound("スキルの版が見つかりません");
      return ok({
        body: streamOf("zip-bytes"),
        size: 9,
        filename: `${name}-v${version}.zip`
      });
    }
  };
  return { service, calls };
}

const verify: AccessVerifier = async (jwt) =>
  jwt === "valid-jwt" ? ok({ email: "member@example.com" }) : forbidden("検証に失敗しました");

function buildApp(service: SkillServicePort) {
  return createApp({ logError: () => {}, skillService: service, accessVerifier: verify });
}

describe("GET /api/skills", () => {
  test("query を service に渡し、skills の一覧を返す", async () => {
    const { service, calls } = fakeService();

    const response = await buildApp(service).request("/api/skills?query=%E3%82%A2", {
      headers: AUTH_HEADER
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skills: [summary] });
    expect(calls).toEqual([{ method: "list", query: "ア" }]);
  });
});

describe("GET /api/skills/:skillName", () => {
  test("詳細を返す", async () => {
    const { service, calls } = fakeService();

    const response = await buildApp(service).request("/api/skills/team-skill", {
      headers: AUTH_HEADER
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(calls).toEqual([{ method: "show", name: "team-skill" }]);
  });

  test("存在しない名前は 404", async () => {
    const { service } = fakeService();

    const response = await buildApp(service).request("/api/skills/missing", {
      headers: AUTH_HEADER
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });
});

describe("GET /api/skills/:skillName/versions/:version/files", () => {
  test("テキストを text/plain で返す", async () => {
    const { service, calls } = fakeService();

    const response = await buildApp(service).request(
      "/api/skills/team-skill/versions/2/files?path=SKILL.md",
      { headers: AUTH_HEADER }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("# 見本のスキル\n");
    expect(calls).toEqual([
      { method: "preview", name: "team-skill", version: 2, path: "SKILL.md" }
    ]);
  });

  test("版が数字でない・0・最新より大きいときは 404", async () => {
    for (const version of ["abc", "0", "99"]) {
      const { service, calls } = fakeService();
      const response = await buildApp(service).request(
        `/api/skills/team-skill/versions/${version}/files?path=SKILL.md`,
        { headers: AUTH_HEADER }
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ kind: "not_found" });
      if (version === "99")
        expect(calls).toEqual([
          { method: "preview", name: "team-skill", version: 99, path: "SKILL.md" }
        ]);
      else expect(calls).toEqual([]);
    }
  });

  test("パスが ../x や /x のときは 404 で、service を呼ばない", async () => {
    for (const path of ["../x", "/x"]) {
      const { service, calls } = fakeService();
      const response = await buildApp(service).request(
        `/api/skills/team-skill/versions/2/files?path=${encodeURIComponent(path)}`,
        { headers: AUTH_HEADER }
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ kind: "not_found" });
      expect(calls).toEqual([]);
    }
  });
});

describe("GET /api/skills/:skillName/versions/:version/download", () => {
  test("zip の Content-Type と Content-Disposition を返す", async () => {
    const { service, calls } = fakeService();

    const response = await buildApp(service).request("/api/skills/team-skill/versions/2/download", {
      headers: AUTH_HEADER
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="team-skill-v2.zip"'
    );
    expect(await response.text()).toBe("zip-bytes");
    expect(calls).toEqual([{ method: "download", name: "team-skill", version: 2 }]);
  });

  test("版が数字でない・0・最新より大きいときは 404", async () => {
    for (const version of ["abc", "0", "99"]) {
      const { service } = fakeService();
      const response = await buildApp(service).request(
        `/api/skills/team-skill/versions/${version}/download`,
        { headers: AUTH_HEADER }
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ kind: "not_found" });
    }
  });
});

describe("認証なし", () => {
  test("スキルの API はすべて 401", async () => {
    const { service } = fakeService();
    const app = buildApp(service);
    const paths = [
      "/api/skills",
      "/api/skills/team-skill",
      "/api/skills/team-skill/versions/2/files?path=SKILL.md",
      "/api/skills/team-skill/versions/2/download"
    ];

    for (const path of paths) {
      const response = await app.request(path);
      expect(response.status).toBe(401);
    }
  });
});

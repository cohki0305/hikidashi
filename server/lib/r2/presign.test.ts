import { describe, expect, it } from "bun:test";
import { copyObject, presignGet, presignPut, type R2S3Config, r2S3ConfigFrom } from "./presign";

const CONFIG: R2S3Config = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "hikidashi-skills"
};

describe("r2S3ConfigFrom", () => {
  it("揃っていれば設定を返す", () => {
    const result = r2S3ConfigFrom({
      R2_ACCOUNT_ID: "test-account",
      R2_BUCKET_NAME: "hikidashi-skills",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key"
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(CONFIG);
  });

  it("欠けていればエラーを返す", () => {
    const result = r2S3ConfigFrom({
      R2_ACCOUNT_ID: "test-account",
      R2_BUCKET_NAME: "hikidashi-skills",
      R2_ACCESS_KEY_ID: "test-access-key"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("invalid");
      expect(result.message).toBeTruthy();
      expect(result.details).toMatchObject({ missingConfig: true });
    }
  });
});

describe("presignGet", () => {
  it("600 秒の署名付き URL を返し、key をパスに入れる", async () => {
    const url = new URL(await presignGet(CONFIG, "uploads/upload-1.zip"));

    expect(url.host).toBe("test-account.r2.cloudflarestorage.com");
    expect(decodeURIComponent(url.pathname)).toBe("/hikidashi-skills/uploads/upload-1.zip");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
  });

  it("有効期限を指定できる", async () => {
    const url = new URL(await presignGet(CONFIG, "versions/skill-1/1.zip", 120));

    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("presignPut", () => {
  it("既定で 1800 秒の署名付き URL を返す", async () => {
    const url = new URL(await presignPut(CONFIG, "uploads/upload-1.zip"));

    expect(url.host).toBe("test-account.r2.cloudflarestorage.com");
    expect(decodeURIComponent(url.pathname)).toBe("/hikidashi-skills/uploads/upload-1.zip");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});

describe("copyObject", () => {
  it("S3 の PUT と x-amz-copy-source でコピーする", async () => {
    let captured: Request | undefined;
    const fetchImpl = async (request: Request): Promise<Response> => {
      captured = request;
      return new Response(null, { status: 200 });
    };

    const result = await copyObject(
      CONFIG,
      "uploads/upload-1.zip",
      "versions/skill-1/1.zip",
      fetchImpl
    );

    expect(result.ok).toBe(true);
    expect(captured).toBeDefined();
    if (!captured) return;
    const url = new URL(captured.url);
    expect(url.host).toBe("test-account.r2.cloudflarestorage.com");
    expect(decodeURIComponent(url.pathname)).toBe("/hikidashi-skills/versions/skill-1/1.zip");
    expect(captured.method).toBe("PUT");
    expect(captured.headers.get("x-amz-copy-source")).toBe(
      "/hikidashi-skills/uploads/upload-1.zip"
    );
    expect(captured.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("2xx 以外はエラーを返す", async () => {
    const result = await copyObject(
      CONFIG,
      "uploads/upload-1.zip",
      "versions/skill-1/1.zip",
      async () => new Response(null, { status: 403 })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("upstream");
      expect(result.message).toBeTruthy();
    }
  });

  it("通信の失敗もエラーを返す", async () => {
    const result = await copyObject(
      CONFIG,
      "uploads/upload-1.zip",
      "versions/skill-1/1.zip",
      async () => {
        throw new Error("network");
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("upstream");
  });
});

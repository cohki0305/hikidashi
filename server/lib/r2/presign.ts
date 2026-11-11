import { AwsClient } from "aws4fetch";
import { invalid, ok, type Result, upstream } from "@/server/lib/result";

/** R2 の S3 互換 API に署名するための設定。 */
export type R2S3Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** R2 の S3 設定を読む環境。値は wrangler の vars と Worker のシークレットから来る。 */
export type R2S3Env = {
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
};

type FetchLike = (request: Request) => Promise<Response>;

/** 環境から署名用の設定を組み立てる。どれか欠けていれば一時 URL を作らずエラーにする。 */
export function r2S3ConfigFrom(env: R2S3Env): Result<R2S3Config> {
  const { R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  const missing = [
    ["R2_ACCOUNT_ID", R2_ACCOUNT_ID],
    ["R2_BUCKET_NAME", R2_BUCKET_NAME],
    ["R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return invalid("R2 の S3 の設定が足りません", { missing });
  }

  return ok({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME
  });
}

function createClient(config: R2S3Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto"
  });
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

function objectUrl(config: R2S3Config, key: string): URL {
  const encodedKey = encodeKey(key);
  return new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${encodedKey}`
  );
}

/** ダウンロード用の署名付き GET の URL を返す。 */
export async function presignGet(
  config: R2S3Config,
  key: string,
  expiresInSeconds = 600
): Promise<string> {
  const url = objectUrl(config, key);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await createClient(config).sign(url, {
    method: "GET",
    aws: { signQuery: true }
  });
  return signed.url;
}

/** アップロード用の署名付き PUT の URL を返す。 */
export async function presignPut(
  config: R2S3Config,
  key: string,
  expiresInSeconds = 1800
): Promise<string> {
  const url = objectUrl(config, key);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await createClient(config).sign(url, {
    method: "PUT",
    aws: { signQuery: true }
  });
  return signed.url;
}

/** S3 の CopyObject でオブジェクトをコピーする。Worker の中をデータが通らない。 */
export async function copyObject(
  config: R2S3Config,
  fromKey: string,
  toKey: string,
  fetchImpl: FetchLike = fetch
): Promise<Result<void>> {
  try {
    const request = await createClient(config).sign(objectUrl(config, toKey), {
      method: "PUT",
      headers: {
        "x-amz-copy-source": `/${encodeURIComponent(config.bucket)}/${encodeKey(fromKey)}`
      }
    });
    const response = await fetchImpl(request);
    if (!response.ok) {
      return upstream("R2 のオブジェクトをコピーできませんでした", { status: response.status });
    }
    return ok(undefined);
  } catch {
    return upstream("R2 のオブジェクトをコピーできませんでした");
  }
}

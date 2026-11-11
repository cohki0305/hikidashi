import { type AppType, createApp } from "./app";

/** Workers の束縛。いまは画面を配る ASSETS だけ。D1・R2 は issue #3 で足す。 */
export type BootstrapEnv = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

/** 依存を組み立てて Hono アプリを返す。束縛はリクエストごとに渡る。 */
export function bootstrap(
  env: BootstrapEnv,
  _waitUntil?: (promise: Promise<unknown>) => void
): AppType {
  const logError = (message: string, context: Record<string, unknown>) =>
    console.error(message, context);
  // ASSETS は entry/worker.ts が直接使う。ここではアプリの組み立てだけを行う。
  void env;
  return createApp({ logError });
}

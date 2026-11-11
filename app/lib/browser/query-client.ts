import { QueryClient } from "@tanstack/react-query";

/** 画面全体で使うデータ取得の窓口。失敗は Result で返すので、自動の再試行はしない。 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
  });
}

import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/app/lib/api";
import { meResponseSchema } from "@/shared/schemas/me";

/** ログイン中のメールアドレス。 */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => getJson("/api/me", meResponseSchema)
  });
}

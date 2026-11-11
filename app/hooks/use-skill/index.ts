import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/app/lib/api";
import { skillDetailResponseSchema } from "@/shared/schemas/skills";

/** スキル 1 件の詳細。 */
export function useSkill(name: string) {
  return useQuery({
    queryKey: ["skill", name],
    queryFn: () => getJson(`/api/skills/${encodeURIComponent(name)}`, skillDetailResponseSchema)
  });
}

import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/app/lib/api";
import { skillListResponseSchema } from "@/shared/schemas/skills";

/** スキル一覧。query が空なら全件。 */
export function useSkills(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["skills", trimmed],
    queryFn: () =>
      getJson(`/api/skills?query=${encodeURIComponent(trimmed)}`, skillListResponseSchema)
  });
}

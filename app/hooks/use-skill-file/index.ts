import { useQuery } from "@tanstack/react-query";
import { getText } from "@/app/lib/api";

/** スキルの版に含まれるファイル 1 つの中身。 */
export function useSkillFile(
  name: string,
  version: number,
  path: string,
  options: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: ["skill-file", name, version, path],
    enabled: options.enabled ?? true,
    queryFn: () =>
      getText(
        `/api/skills/${encodeURIComponent(name)}/versions/${version}/files?path=${encodeURIComponent(path)}`
      )
  });
}

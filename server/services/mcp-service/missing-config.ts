import { MISSING_CONFIG_MESSAGE } from "@/server/lib/mcp/json-rpc";
import { type Err, upstream } from "@/server/lib/result";

/** 設定不足の失敗だけを、管理者向けの文言に置き換える。判定は missingConfig だけを見る。 */
export function toMissingConfig(result: Err): Err | null {
  if (result.details?.missingConfig !== true) return null;
  return upstream(MISSING_CONFIG_MESSAGE);
}

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** ビルド成果物の js のうち、禁止の文字列を含むファイルを返す。 */
export function findLeakedScripts(assetsDir: string, needles: readonly string[]): string[] {
  return readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => {
      const text = readFileSync(path.join(assetsDir, f), "utf8");
      return needles.some((n) => text.includes(n));
    });
}

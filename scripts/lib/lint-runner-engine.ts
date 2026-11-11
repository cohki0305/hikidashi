import { type ParsedSource, parseTypeScript } from "./lint-ast";

export type FileRule = {
  include: RegExp | ((file: string) => boolean);
  exclude?: RegExp;
  ast?: boolean;
  optional?: boolean;
  check(file: string, source: string, ast?: ParsedSource): object[];
};
export type Finding = { rule: number; violation: object };
export type EngineOptions = {
  parse?: (file: string, source: string) => ParsedSource;
  names?: readonly string[];
};

const matches = (pattern: RegExp | ((file: string) => boolean), file: string) =>
  typeof pattern === "function"
    ? pattern(file)
    : new RegExp(pattern.source, pattern.flags.replace("g", "")).test(file);

export function runFileRules(
  files: readonly string[],
  rules: readonly FileRule[],
  read: (file: string) => string,
  { parse = parseTypeScript, names = [] }: EngineOptions = {}
) {
  const counts = rules.map(() => 0);
  const findings: Finding[] = [];
  let readCount = 0;
  let parsed = 0;
  for (const file of files) {
    const matching = rules
      .map((rule, index) => ({ rule, index }))
      .filter(
        ({ rule }) => matches(rule.include, file) && !(rule.exclude && matches(rule.exclude, file))
      );
    if (!matching.length) continue;
    const source = read(file);
    readCount++;
    // AST は同じファイルを見るルール全員で 1 回だけ作り、ファイルをまたいで保持しない。
    let ast: ParsedSource | undefined;
    let failure: string | undefined;
    if (matching.some(({ rule }) => rule.ast)) {
      parsed++;
      try {
        ast = parse(file, source);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    for (const { rule, index } of matching) {
      counts[index]++;
      if (rule.ast && !ast) {
        findings.push({
          rule: index,
          violation: {
            rule: names[index] ?? String(index),
            file,
            message: "解析失敗",
            detail: failure
          }
        });
        continue;
      }
      for (const violation of rule.check(file, source, rule.ast ? ast : undefined))
        findings.push({ rule: index, violation });
    }
  }
  rules.forEach((rule, index) => {
    if (!counts[index] && !rule.optional)
      findings.push({
        rule: index,
        violation: {
          rule: names[index] ?? String(index),
          file: "(対象なし)",
          message: `対象ファイルが 0 件: ${String(rule.include)}`,
          detail: "Fix: scan paths と作業ディレクトリを確認する。"
        }
      });
  });
  return { findings, readCount, parsed };
}

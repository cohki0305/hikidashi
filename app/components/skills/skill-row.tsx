import { formatDate } from "@/app/lib/utils";
import type { SkillSummary } from "@/shared/schemas/skills";

/** 一覧に並ぶスキル 1 件分の行。詳細へのリンクになる。 */
export function SkillRow({ skill }: { skill: SkillSummary }) {
  return (
    <a href={`/skills/${skill.name}`} className="skill-row" title={skill.description}>
      <span className="skill-row__name">
        <span className="skill-row__title">{skill.title}</span>
        {skill.claudeCodeOnly ? <span className="skill-chip">Claude Code 専用</span> : null}
      </span>
      <span className="skill-row__desc">{skill.description}</span>
      <span className="skill-row__author">{skill.author}</span>
      <span className="skill-row__date">{formatDate(skill.updatedAt)}</span>
      <span className="skill-row__version">{`第${skill.latestVersion}版`}</span>
    </a>
  );
}

/** 一覧の見出し行。列の名前を示すだけなので読み上げからは外す。 */
export function SkillListHeader() {
  return (
    <div className="skill-row skill-row--head" aria-hidden="true">
      <span className="skill-row__name">名前</span>
      <span className="skill-row__desc">説明</span>
      <span className="skill-row__author">作った人</span>
      <span className="skill-row__date">更新日</span>
      <span className="skill-row__version">版</span>
    </div>
  );
}

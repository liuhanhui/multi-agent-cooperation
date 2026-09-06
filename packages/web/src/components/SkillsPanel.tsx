import type { SkillSummary } from "@mac/shared";

interface SkillsPanelProps {
  skills: SkillSummary[];
  tokenBudget: number | null;
  selectedId: string | null;
  detailBody: string | null;
  onSelect: (id: string) => void;
}

/**
 * Thin Hub browse surface for the skills catalog (M12).
 * @param props.skills - Summaries from GET /api/skills
 * @param props.tokenBudget - Catalog budget shown in the header
 * @param props.selectedId - Expanded skill id
 * @param props.detailBody - Body markdown for the selected skill
 * @param props.onSelect - Click handler to load/select a skill
 */
export function SkillsPanel({
  skills,
  tokenBudget,
  selectedId,
  detailBody,
  onSelect,
}: SkillsPanelProps) {
  return (
    <aside className="skills-panel" aria-label="Skills catalog">
      <header className="skills-head">
        <h2>Skills</h2>
        <p className="muted tight">
          On-demand injection · budget {tokenBudget ?? "…"} tokens
        </p>
      </header>
      {skills.length === 0 ? (
        <p className="muted">No skills loaded.</p>
      ) : (
        <ul className="skills-list">
          {skills.map((skill) => {
            const open = selectedId === skill.id;
            return (
              <li key={skill.id} className={open ? "skill-item open" : "skill-item"}>
                <button type="button" className="skill-btn" onClick={() => onSelect(skill.id)}>
                  <span className="skill-name">{skill.id}</span>
                  <span className="muted skill-tokens">~{skill.estimatedTokens} tok</span>
                </button>
                <p className="skill-desc">{skill.description.split("\n")[0]}</p>
                <p className="muted skill-triggers">
                  triggers: {skill.triggers.slice(0, 4).join(" · ") || "(none)"}
                </p>
                {open && detailBody ? (
                  <pre className="skill-body">{detailBody}</pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

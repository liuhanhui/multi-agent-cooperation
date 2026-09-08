# Skills Manifest (M12)

Architecture cell: `hub-action-surface` (skills face).

## Layout

```
skills/
  manifest.json          # order + tokenBudget
  tdd/SKILL.md
  request-review/SKILL.md
  debugging/SKILL.md
```

Each `SKILL.md` uses YAML frontmatter: `name`, `description`, `triggers[]`.

## On-demand injection

On `POST .../messages/invoke`, the server matches the **routed prompt** (after @mentions stripped) against triggers (case-insensitive substring).

- Hit → append skill body into that turn's `systemSnippet` (under token budget).
- Miss → **no injection** (Done criterion).
- Over budget → later hits listed in `skillsSkipped` with `token_budget`.

202 response fields: `skillsInjected`, `skillsSkipped`, `skillsTokens`.

Budget: `skills/manifest.json` `tokenBudget` or `MAC_SKILLS_TOKEN_BUDGET`.

## Hub browse

- `GET /api/skills` — summaries + budget
- `GET /api/skills/:id` — full body
- Web right rail: Skills panel (expand to read body)

## Done checklist

| Criterion | Mechanism |
|---|---|
| TDD / request-review / debugging loadable | shipped under `skills/` + manifest |
| Unmatched prompt does not inject | `matchSkills` only keeps trigger hits |
| Hub browseable | API + SkillsPanel |

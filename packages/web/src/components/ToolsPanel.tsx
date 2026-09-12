import type { ToolCatalogEntry } from "@mac/shared";

interface ToolsPanelProps {
  tools: ToolCatalogEntry[];
  aspects: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Thin Hub browse surface for the canonical MCP tool catalog (M13).
 * @param props.tools - Entries from GET /api/tools
 * @param props.aspects - Aspect cut-list shown in the header
 * @param props.selectedId - Expanded tool semantic id
 * @param props.onSelect - Toggle selection for detail
 */
export function ToolsPanel({ tools, aspects, selectedId, onSelect }: ToolsPanelProps) {
  return (
    <aside className="tools-panel" aria-label="MCP tool catalog">
      <header className="skills-head">
        <h2>Tools</h2>
        <p className="muted tight">
          Shared paws · {aspects.length ? aspects.join(" · ") : "…"}
        </p>
      </header>
      {tools.length === 0 ? (
        <p className="muted">No tools registered.</p>
      ) : (
        <ul className="skills-list">
          {tools.map((tool) => {
            const open = selectedId === tool.id;
            return (
              <li key={tool.id} className={open ? "skill-item open" : "skill-item"}>
                <button type="button" className="skill-btn" onClick={() => onSelect(tool.id)}>
                  <span className="skill-name">{tool.id}</span>
                  <span className="muted skill-tokens">{tool.mcpName}</span>
                </button>
                <p className="skill-desc">{tool.title}</p>
                <p className="muted skill-triggers">
                  {tool.annotations.aspect} · {tool.exposure.join(", ")} ·{" "}
                  {tool.annotations.families.join(" / ")}
                </p>
                {open ? (
                  <pre className="skill-body">
                    {tool.description}
                    {"\n\n"}
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

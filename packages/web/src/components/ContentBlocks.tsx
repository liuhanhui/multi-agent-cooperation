import type { ContentBlock, HubBlockAction } from "@mac/shared";

interface ContentBlocksProps {
  blocks: ContentBlock[];
  /** When set, checklist/decision are interactive. */
  onAction?: (action: HubBlockAction) => void;
  disabled?: boolean;
}

/**
 * Render structured Hub content blocks (M14): checklist, decision, diff, card, text.
 * @param props.blocks - Blocks from message.blocks
 * @param props.onAction - Optional Hub action callback (toggle/select)
 * @param props.disabled - Disable inputs while a request is in flight
 */
export function ContentBlocks({ blocks, onAction, disabled }: ContentBlocksProps) {
  if (blocks.length === 0) return null;
  return (
    <div className="content-blocks">
      {blocks.map((block) => {
        if (block.type === "text") {
          return (
            <p key={block.id} className="block-text">
              {block.text}
            </p>
          );
        }
        if (block.type === "checklist") {
          return (
            <section key={block.id} className="block-checklist" aria-label={block.title ?? "Checklist"}>
              {block.title ? <h3 className="block-title">{block.title}</h3> : null}
              <ul>
                {block.items.map((item) => (
                  <li key={item.id}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        disabled={disabled || !onAction}
                        onChange={(e) =>
                          onAction?.({
                            type: "checklist.toggle",
                            blockId: block.id,
                            itemId: item.id,
                            checked: e.target.checked,
                          })
                        }
                      />
                      <span>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        if (block.type === "decision") {
          return (
            <section key={block.id} className="block-decision" aria-label="Decision">
              <p className="block-title">{block.prompt}</p>
              <div className="decision-options">
                {block.options.map((opt) => {
                  const selected = block.selectedId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={selected ? "decision-opt selected" : "decision-opt"}
                      disabled={disabled || !onAction}
                      onClick={() =>
                        onAction?.({
                          type: "decision.select",
                          blockId: block.id,
                          optionId: opt.id,
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        }
        if (block.type === "diff") {
          return (
            <section key={block.id} className="block-diff" aria-label={block.path ?? "Diff"}>
              {block.path ? <p className="block-title muted">{block.path}</p> : null}
              {block.before ? (
                <pre className="diff-before">{block.before}</pre>
              ) : null}
              <pre className="diff-after">{block.after}</pre>
            </section>
          );
        }
        if (block.type === "card") {
          return (
            <aside
              key={block.id}
              className={`block-card tone-${block.tone ?? "info"}`}
              aria-label={block.title}
            >
              <h3 className="block-title">{block.title}</h3>
              <p>{block.body}</p>
            </aside>
          );
        }
        return null;
      })}
    </div>
  );
}

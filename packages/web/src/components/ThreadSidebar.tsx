import type { CatConfig, Thread } from "@mac/shared";

interface ThreadSidebarProps {
  threads: Thread[];
  cats: CatConfig[];
  activeId: string | null;
  title: string;
  onTitleChange: (value: string) => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
}

/**
 * Left rail: create thread + select from list (thread-navigation cell).
 * @param props.threads - Current thread list from the API
 * @param props.cats - Used to label each row's default cat
 * @param props.activeId - Highlighted thread id
 * @param props.title / onTitleChange - New-thread title field
 * @param props.onCreate / onSelect - Create and switch actions
 */
export function ThreadSidebar({
  threads,
  cats,
  activeId,
  title,
  onTitleChange,
  onCreate,
  onSelect,
}: ThreadSidebarProps) {
  return (
    <aside className="sidebar">
      <h2 className="panel-title">Threads</h2>
      <p className="muted tight">Cozy rooms for each conversation</p>
      <div className="paw-trail" aria-hidden="true">
        <span className="paw mint" />
        <span className="paw soft" />
      </div>
      <div className="row">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Name a new room…"
          aria-label="New thread title"
        />
        <button type="button" onClick={onCreate}>
          Open
        </button>
      </div>
      <ul className="thread-list">
        {threads.map((t) => {
          const def = cats.find((c) => c.id === t.defaultCatId);
          return (
            <li key={t.id}>
              <button
                type="button"
                className={t.id === activeId ? "active" : undefined}
                onClick={() => onSelect(t.id)}
              >
                <span className="thread-title">{t.title}</span>
                <span className="thread-meta muted">
                  {def ? def.displayName : "no default"} · seq {t.lastSeq}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

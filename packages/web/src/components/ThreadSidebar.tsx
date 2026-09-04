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
      <div className="row">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="New thread title"
          aria-label="New thread title"
        />
        <button type="button" onClick={onCreate}>
          New
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

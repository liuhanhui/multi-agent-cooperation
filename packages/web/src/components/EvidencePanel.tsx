import { useState } from "react";
import type { Evidence, EvidenceHit } from "@mac/shared";

interface EvidencePanelProps {
  evidence: Evidence[];
  searchHits: EvidenceHit[] | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onSearch: (q: string) => Promise<void>;
  onCreate: (input: {
    title: string;
    body: string;
    tags?: string[];
    provenance: { source: string; actorId?: string };
  }) => Promise<void>;
}

/**
 * Thin Hub surface for evidence write + BM25 browse (M16).
 * @param props.evidence - Latest list from GET /api/evidence
 * @param props.searchHits - Optional search results (null = show list)
 * @param props.busy - Mutation lock
 * @param props.onRefresh - Reload list
 * @param props.onSearch - Run BM25 search
 * @param props.onCreate - Write evidence with provenance
 */
export function EvidencePanel({
  evidence,
  searchHits,
  busy = false,
  onRefresh,
  onSearch,
  onCreate,
}: EvidencePanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("decision");
  const [query, setQuery] = useState("");

  /**
   * Submit create form when title/body/source are present.
   */
  async function handleCreate(): Promise<void> {
    if (!title.trim() || !body.trim() || !source.trim() || busy) return;
    await onCreate({
      title: title.trim(),
      body: body.trim(),
      provenance: { source: source.trim() },
    });
    setTitle("");
    setBody("");
  }

  const rows =
    searchHits != null ? searchHits.map((h) => h.evidence) : evidence;

  return (
    <aside className="skills-panel evidence-panel" aria-label="Evidence memory">
      <header className="skills-head">
        <h2>Evidence</h2>
        <p className="muted tight">SQLite · BM25 · provenance required</p>
      </header>

      <div className="evidence-form">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          disabled={busy}
          aria-label="Evidence title"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body (the fact to recall)"
          disabled={busy}
          rows={3}
          aria-label="Evidence body"
        />
        <div className="row">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="provenance.source"
            disabled={busy}
            aria-label="Provenance source"
          />
          <button
            type="button"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void handleCreate()}
          >
            Write
          </button>
        </div>
      </div>

      <div className="row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cue…"
          disabled={busy}
          aria-label="Evidence search"
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSearch(query);
          }}
        />
        <button type="button" className="ghost" disabled={busy} onClick={() => void onSearch(query)}>
          Search
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            setQuery("");
            void onRefresh();
          }}
        >
          List
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No evidence yet.</p>
      ) : (
        <ul className="skills-list">
          {rows.map((row) => (
            <li key={row.id} className="skill-item">
              <p className="skill-name">{row.title}</p>
              <p className="skill-desc">{row.body}</p>
              <p className="muted skill-triggers">
                {row.provenance.source} · {row.provenance.recordedAt.slice(0, 10)}
                {row.tags.length ? ` · ${row.tags.join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

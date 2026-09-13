import { useState } from "react";
import type { GithubResourceRef, GithubThreadBinding } from "@mac/shared";

interface GithubChannelPanelProps {
  bindings: GithubThreadBinding[];
  activeThreadId: string | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onBind: (input: {
    threadId: string;
    ref: GithubResourceRef;
    awaitId?: string | null;
  }) => Promise<void>;
  onSimulate: (input: {
    event: string;
    action?: string | null;
    ref: GithubResourceRef;
    summary?: string;
  }) => Promise<void>;
}

/**
 * Hub Channel surface for GitHub PR/issue bind + simulate wake (M22).
 * @param props.bindings - Current bindings list
 * @param props.activeThreadId - Default bind target
 * @param props.busy - Mutation lock
 * @param props.onRefresh / onBind / onSimulate - API mutators
 */
export function GithubChannelPanel({
  bindings,
  activeThreadId,
  busy = false,
  onRefresh,
  onBind,
  onSimulate,
}: GithubChannelPanelProps) {
  const [owner, setOwner] = useState("acme");
  const [repo, setRepo] = useState("mac");
  const [number, setNumber] = useState("1");
  const [kind, setKind] = useState<"pr" | "issue">("pr");
  const [awaitId, setAwaitId] = useState("");

  /**
   * Build ref from form fields.
   * @returns Parsed GithubResourceRef or null when invalid
   */
  function parseRef(): GithubResourceRef | null {
    const n = Number(number);
    if (!owner.trim() || !repo.trim() || !Number.isFinite(n) || n < 1) return null;
    return {
      owner: owner.trim(),
      repo: repo.trim(),
      number: Math.floor(n),
      kind,
    };
  }

  /**
   * Bind the open thread to the form PR/issue.
   */
  async function handleBind(): Promise<void> {
    const ref = parseRef();
    if (!activeThreadId || !ref || busy) return;
    await onBind({
      threadId: activeThreadId,
      ref,
      awaitId: awaitId.trim() || null,
    });
  }

  /**
   * Fire a simulated GitHub review event through the same router as webhooks.
   */
  async function handleSimulate(): Promise<void> {
    const ref = parseRef();
    if (!ref || busy) return;
    await onSimulate({
      event: kind === "pr" ? "pull_request_review" : "issues",
      action: kind === "pr" ? "submitted" : "closed",
      ref,
      summary: "Hub simulate signal",
    });
  }

  return (
    <aside className="skills-panel github-channel-panel" aria-label="GitHub channel">
      <header className="skills-head">
        <h2>GitHub</h2>
        <p className="muted tight">Bind PR/issue · simulate wake · webhook HMAC</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
        <input
          value={owner}
          disabled={busy}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="owner"
          aria-label="GitHub owner"
        />
        <input
          value={repo}
          disabled={busy}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="repo"
          aria-label="GitHub repo"
        />
        <input
          value={number}
          disabled={busy}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="#"
          aria-label="PR or issue number"
        />
        <select
          value={kind}
          disabled={busy}
          onChange={(e) => setKind(e.target.value as "pr" | "issue")}
          aria-label="Resource kind"
        >
          <option value="pr">pr</option>
          <option value="issue">issue</option>
        </select>
        <input
          value={awaitId}
          disabled={busy}
          onChange={(e) => setAwaitId(e.target.value)}
          placeholder="optional awaitId from Ball wait"
          aria-label="Await id"
        />
        <button type="button" disabled={busy || !activeThreadId} onClick={() => void handleBind()}>
          Bind to open thread
        </button>
        <button type="button" disabled={busy} onClick={() => void handleSimulate()}>
          Simulate signal
        </button>
      </div>

      <p className="muted tight">
        Real ingress: POST /webhooks/github with MAC_GITHUB_WEBHOOK_SECRET.
      </p>

      {bindings.length === 0 ? (
        <p className="muted">No bindings yet.</p>
      ) : (
        <ul className="skills-list">
          {bindings.map((b) => (
            <li key={b.id} className="receipt-batch">
              <strong>
                {b.ref.owner}/{b.ref.repo}#{b.ref.number}
              </strong>{" "}
              <span className="muted">
                {b.ref.kind} → thread {b.threadId.slice(0, 8)}…
                {b.awaitId ? ` · await ${b.awaitId.slice(0, 8)}…` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

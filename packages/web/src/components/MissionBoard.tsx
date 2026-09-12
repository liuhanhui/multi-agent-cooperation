import { useState } from "react";
import type { BulletinBoard, CatConfig, Feature, FeatureStage } from "@mac/shared";
import { FEATURE_STAGE_TRANSITIONS } from "@mac/shared";

interface MissionBoardProps {
  bulletin: BulletinBoard | null;
  cats: CatConfig[];
  /** Currently selected chat thread; used for bind + create seed. */
  activeThreadId: string | null;
  busy?: boolean;
  onCreate: (input: {
    title: string;
    summary?: string;
    ballHolderId?: string | null;
  }) => Promise<void>;
  onAdvance: (featureId: string, stage: FeatureStage) => Promise<void>;
  onBindThread: (featureId: string) => Promise<void>;
}

/**
 * Mission Hub bulletin: SOP columns, create/advance, bind active thread.
 * @param props.bulletin - Board projection from GET /api/bulletin
 * @param props.cats - Registry for ball-holder select
 * @param props.activeThreadId - Thread used when binding / seeding create
 * @param props.busy - Disable controls while a mutation is in flight
 * @param props.onCreate - Create feature (idea stage)
 * @param props.onAdvance - SOP stage transition
 * @param props.onBindThread - Bind active thread to a feature card
 */
export function MissionBoard({
  bulletin,
  cats,
  activeThreadId,
  busy = false,
  onCreate,
  onAdvance,
  onBindThread,
}: MissionBoardProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [ballHolderId, setBallHolderId] = useState("");

  /**
   * Submit create form; clears fields on success.
   */
  async function handleCreate(): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    await onCreate({
      title: trimmed,
      summary: summary.trim() || undefined,
      ballHolderId: ballHolderId || null,
    });
    setTitle("");
    setSummary("");
    setBallHolderId("");
  }

  return (
    <details className="mission-board" aria-label="Mission Hub bulletin">
      <summary>
        <div>
          <h2>Mission board</h2>
          <p className="muted tight">
            Soft SOP path · idea → spec → wip → review → done
            {activeThreadId
              ? " · bind uses the open thread"
              : " · open a thread to bind work"}
          </p>
        </div>
      </summary>

      <div className="mission-create row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New feature title"
          disabled={busy}
          aria-label="Feature title"
        />
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Summary (optional)"
          disabled={busy}
          aria-label="Feature summary"
        />
        <select
          value={ballHolderId}
          onChange={(e) => setBallHolderId(e.target.value)}
          disabled={busy || cats.length === 0}
          aria-label="Ball holder"
        >
          <option value="">Who holds the ball…</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !title.trim()} onClick={() => void handleCreate()}>
          Create
        </button>
      </div>

      {!bulletin ? (
        <p className="muted">Warming up the bulletin…</p>
      ) : (
        <div className="mission-columns">
          {bulletin.columns.map((col) => (
            <div key={col.stage} className="mission-column">
              <h3 className="mission-stage">{col.stage}</h3>
              {col.features.length === 0 ? (
                <p className="muted tight mission-empty">—</p>
              ) : (
                <ul className="mission-cards">
                  {col.features.map((feature) => (
                    <MissionCard
                      key={feature.id}
                      feature={feature}
                      cats={cats}
                      activeThreadId={activeThreadId}
                      busy={busy}
                      onAdvance={onAdvance}
                      onBindThread={onBindThread}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

interface MissionCardProps {
  feature: Feature;
  cats: CatConfig[];
  activeThreadId: string | null;
  busy: boolean;
  onAdvance: (featureId: string, stage: FeatureStage) => Promise<void>;
  onBindThread: (featureId: string) => Promise<void>;
}

/**
 * One feature card with SOP advance targets and bind control.
 * @param props.feature - Feature row
 * @param props.cats - For ball-holder label
 * @param props.activeThreadId - Current chat thread
 * @param props.busy - Mutation lock
 * @param props.onAdvance - Stage transition handler
 * @param props.onBindThread - Bind handler
 */
function MissionCard({
  feature,
  cats,
  activeThreadId,
  busy,
  onAdvance,
  onBindThread,
}: MissionCardProps) {
  const holder =
    feature.ballHolderId == null
      ? null
      : (cats.find((c) => c.id === feature.ballHolderId)?.displayName ?? feature.ballHolderId);
  const next = FEATURE_STAGE_TRANSITIONS[feature.stage];
  const bound =
    activeThreadId != null && feature.threadIds.includes(activeThreadId);

  return (
    <li className="mission-card">
      <p className="mission-card-title">{feature.title}</p>
      {feature.summary ? <p className="muted tight">{feature.summary}</p> : null}
      <p className="muted tight mission-card-meta">
        {holder ? `ball: ${holder}` : "ball: —"} · threads: {feature.threadIds.length}
      </p>
      <div className="mission-card-actions">
        {next.map((stage) => (
          <button
            key={stage}
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void onAdvance(feature.id, stage)}
          >
            → {stage}
          </button>
        ))}
        <button
          type="button"
          className="ghost"
          disabled={busy || !activeThreadId || bound}
          onClick={() => void onBindThread(feature.id)}
          title={
            !activeThreadId
              ? "Select a thread first"
              : bound
                ? "Active thread already bound"
                : "Bind active thread"
          }
        >
          {bound ? "Bound" : "Bind thread"}
        </button>
      </div>
    </li>
  );
}

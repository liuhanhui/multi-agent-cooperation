import type { CatConfig, Message, Thread } from "@mac/shared";
import type { CSSProperties } from "react";
import { avatarInitials, avatarTone } from "../chat/avatar";
import {
  deriveCafeScene,
  type CafeCatPlace,
  type CafeCatScene,
} from "../features/cafe/cafe-scene";
import type { WsState } from "../hooks/useThreadSocket";
import type { VisibleCafeRuntime } from "../hooks/useVisibleCafeRuntime";

interface CafePanelProps {
  cats: CatConfig[];
  thread: Thread | null;
  messages: Message[];
  wsState: WsState;
  runtime: VisibleCafeRuntime;
}

/**
 * Render a café-shaped view derived directly from current Hub contracts.
 * @param props - Registry cats, selected thread, socket bubbles, and connection state
 * @returns Read-only scene; it creates no lifecycle or persisted state
 */
export function CafePanel({
  cats,
  thread,
  messages,
  wsState,
  runtime,
}: CafePanelProps) {
  // Recompute from canonical props every render so the café cannot drift from Hub truth.
  const scene = deriveCafeScene({
    cats,
    thread,
    messages,
    wsState,
    invocations:
      runtime.status === "ready"
        ? { entries: runtime.entries, turns: runtime.turns }
        : undefined,
  });

  return (
    <aside className="skills-panel cafe-panel" aria-label="Visible Café">
      <header className="skills-head cafe-head">
        <div>
          <p className="eyebrow">Live room projection</p>
          <h2>Visible Café</h2>
          <p className="muted tight">
            A read-only window onto the selected thread.
          </p>
        </div>
        <div className="cafe-source-badges">
          <span className={`cafe-live-badge ${scene.connection}`}>
            <span aria-hidden="true" />
            ws {scene.connection}
          </span>
          <span className={`cafe-live-badge dispatch-${runtime.status}`}>
            <span aria-hidden="true" />
            queue {runtime.status}
          </span>
        </div>
      </header>

      <section
        className={`cafe-stage phase-${scene.phase}`}
        aria-label={`${scene.roomTitle}, ${scene.phase}`}
      >
        <div className="cafe-sky" aria-hidden="true">
          <span className="cafe-cloud cloud-one" />
          <span className="cafe-cloud cloud-two" />
        </div>
        <div className="cafe-room-sign">
          <span>{scene.roomTitle}</span>
          <small>{scene.phase}</small>
        </div>

        <CafeZone
          place="window"
          label="Window"
          cats={scene.cats.filter((cat) => cat.place === "window")}
        />
        <CafeZone
          place="desk"
          label="Lead desk"
          cats={scene.cats.filter((cat) => cat.place === "desk")}
        />
        <CafeZone
          place="cushion"
          label="Room cushions"
          cats={scene.cats.filter((cat) => cat.place === "cushion")}
        />
      </section>

      <div className="cafe-legend" aria-label="Café state legend">
        <span><i className="ready" /> ready</span>
        <span><i className="working" /> working</span>
        <span><i className="queued" /> queued</span>
        <span><i className="error" /> attention</span>
        <span><i className="away" /> outside room</span>
      </div>

      <section className="cafe-activity" aria-label="Recent room activity">
        <div className="cafe-section-title">
          <p className="panel-title">Recent room activity</p>
          <span>{scene.recentActivity.length} traces</span>
        </div>
        {scene.recentActivity.length === 0 ? (
          <p className="muted cafe-no-activity">
            Select a room with messages to see its live traces.
          </p>
        ) : (
          <ol>
            {scene.recentActivity.map((activity) => (
              <li key={activity.id}>
                <span className={`cafe-activity-dot ${activity.status}`} />
                <div>
                  <strong>{activity.authorId}</strong>
                  <p>{activity.content}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="cafe-truth-note">
        Thread membership, default cat, messages, and WebSocket state remain the
        only source of truth.
      </p>
    </aside>
  );
}

interface CafeZoneProps {
  place: CafeCatPlace;
  label: string;
  cats: CafeCatScene[];
}

/**
 * Group projected cats around one visual café location.
 * @param props - Location id, accessible label, and cats assigned by derivation
 * @returns One stage zone with zero or more cat figures
 */
function CafeZone({ place, label, cats }: CafeZoneProps) {
  return (
    <div className={`cafe-zone cafe-zone-${place}`} aria-label={label}>
      <span className="cafe-zone-label">{label}</span>
      <div className={`cafe-furniture cafe-furniture-${place}`} aria-hidden="true" />
      <div className="cafe-zone-cats">
        {cats.map((cat) => (
          <CafeCatFigure key={cat.catId} cat={cat} />
        ))}
      </div>
    </div>
  );
}

/**
 * Render one cat with a lifecycle-derived mood and accessible status.
 * @param props.cat - Scene projection for a registry cat
 * @returns Cat figure whose animation is controlled only by projected mood
 */
function CafeCatFigure({ cat }: { cat: CafeCatScene }) {
  return (
    <article
      className={`cafe-cat mood-${cat.mood}`}
      aria-label={`${cat.displayName}: ${cat.detail}`}
    >
      <div
        className="cafe-cat-face"
        style={{ "--cat-tone": avatarTone(cat.catId) } as CSSProperties}
        aria-hidden="true"
      >
        <span className="cafe-cat-ear left" />
        <span className="cafe-cat-ear right" />
        <span className="cafe-cat-initials">
          {avatarInitials(cat.displayName)}
        </span>
        <span className="cafe-cat-tail" />
      </div>
      <div className="cafe-cat-copy">
        <strong>{cat.displayName}</strong>
        <span>{cat.detail}</span>
      </div>
    </article>
  );
}

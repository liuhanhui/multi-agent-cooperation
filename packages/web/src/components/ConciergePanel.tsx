import { useEffect, useRef, useState } from "react";
import { FIRST_ROOM_GUIDE } from "../features/guide/guide-catalog";
import { useGuideEngine } from "../features/guide/useGuideEngine";

/**
 * Persistent M26 Concierge entry and resumable first-room guide HUD.
 * @returns Launcher plus contextual guide panel
 */
export function ConciergePanel() {
  const guide = useGuideEngine(FIRST_ROOM_GUIDE);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(
    guide.progress.status === "active" || guide.progress.startedAt === null,
  );
  const completedSteps =
    guide.progress.status === "completed"
      ? FIRST_ROOM_GUIDE.steps.length
      : guide.progress.stepIndex;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    /**
     * Pause and close the non-modal guide drawer with Escape.
     * @param event - Window keyboard event
     * @returns Nothing
     */
    function handleEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      close();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, guide.progress.status]);

  /**
   * Exit an active guide before hiding the Concierge panel.
   * @returns Nothing; active progress remains resumable
   */
  function close(): void {
    if (guide.progress.status === "active") guide.exit();
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }

  /**
   * Start or resume the flow and keep its HUD visible.
   * @returns Nothing
   */
  function start(): void {
    guide.start();
    setOpen(true);
  }

  /**
   * Restart the canonical flow from its first target.
   * @returns Nothing
   */
  function restart(): void {
    guide.restart();
    setOpen(true);
  }

  /**
   * Toggle the persistent entry without leaving a hidden guide running.
   * @returns Nothing; closing an active HUD pauses it
   */
  function togglePanel(): void {
    if (open && guide.progress.status === "active") guide.exit();
    setOpen((value) => !value);
    if (open) {
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    }
  }

  return (
    <>
      <button
        type="button"
        ref={launcherRef}
        className="concierge-launch"
        onClick={togglePanel}
        aria-expanded={open}
        aria-controls="operator-concierge"
      >
        Concierge
        <span className={`concierge-state ${guide.progress.status}`}>
          {guide.progress.status === "completed"
            ? "✓"
            : `${completedSteps}/${FIRST_ROOM_GUIDE.steps.length}`}
        </span>
      </button>

      {open ? (
        <aside
          id="operator-concierge"
          ref={panelRef}
          className="concierge-panel"
          aria-label="Operator Concierge"
          tabIndex={-1}
        >
          <header className="concierge-head">
            <div>
              <p className="muted tight">Always available</p>
              <h2>Concierge</h2>
            </div>
            <button type="button" className="ghost" onClick={close}>
              Close
            </button>
          </header>

          {guide.progress.status === "active" ? (
            <section className="concierge-guide" aria-live="polite">
              <div className="concierge-progress-copy">
                <span>
                  Step {guide.progress.stepIndex + 1} of{" "}
                  {FIRST_ROOM_GUIDE.steps.length}
                </span>
                <span>{guide.targetFound ? "Target ready" : "Locating target…"}</span>
              </div>
              <div
                className="concierge-progress"
                role="progressbar"
                aria-label="First room guide progress"
                aria-valuemin={0}
                aria-valuemax={FIRST_ROOM_GUIDE.steps.length}
                aria-valuenow={guide.progress.stepIndex}
              >
                <span
                  style={{
                    width: `${
                      (guide.progress.stepIndex /
                        FIRST_ROOM_GUIDE.steps.length) *
                      100
                    }%`,
                  }}
                />
              </div>
              <p className="concierge-step-target tight">
                {guide.currentStep.target}
              </p>
              <h3>{guide.currentStep.title}</h3>
              <p className="muted">{guide.currentStep.tips}</p>
              <p className="concierge-auto tight">
                Continue in the highlighted area — this guide advances automatically.
              </p>
              <button type="button" className="ghost" onClick={guide.exit}>
                Exit and resume later
              </button>
            </section>
          ) : null}

          {guide.progress.status === "idle" ? (
            <section className="concierge-intro">
              <p>{FIRST_ROOM_GUIDE.description}</p>
              <p className="muted">
                The tour follows real product actions and remembers your position in
                this browser.
              </p>
              <div className="row">
                <button type="button" onClick={start}>
                  {guide.progress.startedAt ? "Resume tour" : "Start guided tour"}
                </button>
                {guide.progress.startedAt ? (
                  <button type="button" className="ghost" onClick={restart}>
                    Restart
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {guide.progress.status === "completed" ? (
            <section className="concierge-complete">
              <span className="concierge-complete-mark" aria-hidden="true">
                ✓
              </span>
              <h3>First room tour complete</h3>
              <p className="muted">
                You created a workspace, exercised the message pipeline, and found
                the Hub.
              </p>
              <button type="button" className="ghost" onClick={restart}>
                Run tour again
              </button>
            </section>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}

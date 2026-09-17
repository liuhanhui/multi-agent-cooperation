import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "mac.bootcamp.v1";

interface StoredBootcamp {
  completedIds: string[];
  dismissed: boolean;
}

interface BootcampPanelProps {
  healthOk: boolean;
  threadCount: number;
  messageCount: number;
}

interface BootcampStep {
  id: string;
  title: string;
  instruction: string;
  done: boolean;
  automatic: boolean;
}

/**
 * Read the local operator walkthrough state; malformed storage starts fresh.
 * @returns Persisted completed steps and dismissal flag
 */
function readState(): StoredBootcamp {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedIds: [], dismissed: false };
    const parsed = JSON.parse(raw) as Partial<StoredBootcamp>;
    return {
      completedIds: Array.isArray(parsed.completedIds)
        ? parsed.completedIds.filter((id): id is string => typeof id === "string")
        : [],
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { completedIds: [], dismissed: false };
  }
}

/**
 * Minimal 3–5 minute operator Bootcamp persisted only in this browser.
 * @param props.healthOk - API health signal
 * @param props.threadCount - Existing rooms, used to auto-complete thread creation
 * @param props.messageCount - Active-thread messages, used to auto-complete first turn
 * @returns Bootcamp launcher and optional guided panel
 */
export function BootcampPanel({
  healthOk,
  threadCount,
  messageCount,
}: BootcampPanelProps) {
  const initial = useMemo(readState, []);
  const [open, setOpen] = useState(!initial.dismissed);
  const [completedIds, setCompletedIds] = useState<string[]>(initial.completedIds);

  const steps: BootcampStep[] = [
    {
      id: "health",
      title: "Meet the lounge",
      instruction: "Confirm the health pill says ok and all three cats appear.",
      done: healthOk,
      automatic: true,
    },
    {
      id: "thread",
      title: "Open a room",
      instruction: "Name a thread on the left and press Open.",
      done: threadCount > 0,
      automatic: true,
    },
    {
      id: "message",
      title: "Call a cat",
      instruction: "Send “hello” or “@architect explain this room”. Echo also works offline.",
      done: messageCount > 0,
      automatic: true,
    },
    {
      id: "hub",
      title: "Inspect the Hub",
      instruction: "Open Ball, Approvals, GitHub, or Plugins and look at one control.",
      done: completedIds.includes("hub"),
      automatic: false,
    },
    {
      id: "laws",
      title: "Keep the four laws",
      instruction:
        "Storage is never wiped; parent processes live; runtime config is read-only; ports stay 4010/4011/6410.",
      done: completedIds.includes("laws"),
      automatic: false,
    },
  ];
  const completedCount = steps.filter((step) => step.done).length;
  const finished = completedCount === steps.length;

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ completedIds, dismissed: !open }),
    );
  }, [completedIds, open]);

  /**
   * Toggle one manually acknowledged Bootcamp step.
   * @param id - Manual step id
   * @returns Nothing; updates local browser state
   */
  function toggleManual(id: string): void {
    setCompletedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  /**
   * Clear local progress and reopen the walkthrough.
   * @returns Nothing; resets local component state
   */
  function reset(): void {
    setCompletedIds([]);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="bootcamp-launch"
        onClick={() => setOpen((value) => !value)}
      >
        Bootcamp {completedCount}/{steps.length}
      </button>

      {open ? (
        <aside className="bootcamp-panel" aria-label="Operator Bootcamp">
          <header className="bootcamp-head">
            <div>
              <p className="muted tight">3–5 minute walkthrough</p>
              <h2>Operator Bootcamp</h2>
            </div>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>

          <div
            className="bootcamp-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={completedCount}
          >
            <span style={{ width: `${(completedCount / steps.length) * 100}%` }} />
          </div>

          <ol className="bootcamp-steps">
            {steps.map((step) => (
              <li key={step.id} className={step.done ? "done" : undefined}>
                <span className="bootcamp-check" aria-hidden="true">
                  {step.done ? "✓" : "·"}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p className="muted tight">{step.instruction}</p>
                  {!step.automatic ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => toggleManual(step.id)}
                    >
                      {step.done ? "Mark not done" : "I checked this"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <p className={finished ? "bootcamp-finished" : "muted tight"}>
            {finished
              ? "Bootcamp complete — the lounge is ready."
              : "Automatic steps update as you use this room."}
          </p>
          <button type="button" className="ghost" onClick={reset}>
            Reset walkthrough
          </button>
        </aside>
      ) : null}
    </>
  );
}

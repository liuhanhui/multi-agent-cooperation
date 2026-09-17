import { useState, type FormEvent } from "react";
import type {
  CaptureFrictionInput,
  EvaluateFrictionInput,
  FrictionCategory,
  FrictionRecord,
  FrictionSeverity,
  FrictionVerdictOutcome,
  OwnerResponseDisposition,
  RespondFrictionInput,
} from "@mac/shared";
import {
  FormField,
  SelectControl,
  TextAreaControl,
  TextControl,
} from "./ui/FormField";

interface FrictionPanelProps {
  frictions: FrictionRecord[];
  activeThreadId: string | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onCapture: (input: CaptureFrictionInput) => Promise<void>;
  onEvaluate: (id: string, input: EvaluateFrictionInput) => Promise<void>;
  onRespond: (id: string, input: RespondFrictionInput) => Promise<void>;
}

const CATEGORIES: FrictionCategory[] = [
  "tooling",
  "routing",
  "memory",
  "workflow",
  "ux",
  "other",
];
const OUTCOMES: FrictionVerdictOutcome[] = [
  "confirmed",
  "not_reproducible",
  "duplicate",
  "wont_fix",
];
const DISPOSITIONS: OwnerResponseDisposition[] = [
  "planned",
  "fixed",
  "declined",
  "escalated",
];

/**
 * Render the M25 capture → verdict → owner-response workspace.
 * @param props - Ledger, active thread context, mutation lock, and lifecycle actions
 * @returns Friction harness panel
 */
export function FrictionPanel({
  frictions,
  activeThreadId,
  busy = false,
  onRefresh,
  onCapture,
  onEvaluate,
  onRespond,
}: FrictionPanelProps) {
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<FrictionCategory>("workflow");
  const [severity, setSeverity] = useState<FrictionSeverity>("medium");
  const [rationaleById, setRationaleById] = useState<Record<string, string>>({});
  const [ownerById, setOwnerById] = useState<Record<string, string>>({});
  const [outcomeById, setOutcomeById] = useState<
    Record<string, FrictionVerdictOutcome>
  >({});
  const [responseById, setResponseById] = useState<Record<string, string>>({});
  const [dispositionById, setDispositionById] = useState<
    Record<string, OwnerResponseDisposition>
  >({});

  /**
   * Capture the form as an operator report linked to the active thread.
   * @param event - Form submission event
   * @returns Promise after capture
   */
  async function submitCapture(event: FormEvent): Promise<void> {
    event.preventDefault();
    await onCapture({
      source: "operator",
      category,
      severity,
      summary,
      detail,
      reporterId: "operator",
      threadId: activeThreadId,
    });
    setSummary("");
    setDetail("");
  }

  /**
   * Evaluate one captured row and assign its accountable owner.
   * @param friction - Captured friction record
   * @returns Promise after verdict
   */
  async function submitVerdict(friction: FrictionRecord): Promise<void> {
    await onEvaluate(friction.id, {
      outcome: outcomeById[friction.id] ?? "confirmed",
      rationale: rationaleById[friction.id] ?? "",
      evaluatorId: "operator",
      ownerId: ownerById[friction.id] ?? "builder",
    });
  }

  /**
   * Submit the response under the owner assigned by the verdict.
   * @param friction - Evaluated friction with an owner
   * @returns Promise after response
   */
  async function submitResponse(friction: FrictionRecord): Promise<void> {
    if (!friction.verdict) return;
    await onRespond(friction.id, {
      disposition: dispositionById[friction.id] ?? "planned",
      note: responseById[friction.id] ?? "",
      responderId: friction.verdict.ownerId,
    });
  }

  return (
    <aside className="skills-panel friction-panel" aria-label="Friction harness">
      <header className="skills-head">
        <h2>Friction Harness</h2>
        <p className="muted tight">
          Capture → verdict → accountable owner response
        </p>
      </header>

      <form className="evidence-form friction-capture" onSubmit={submitCapture}>
        <FormField label="Summary">
          <TextControl
            value={summary}
            required
            disabled={busy}
            placeholder="What went wrong?"
            onChange={(event) => setSummary(event.target.value)}
            aria-label="Friction summary"
          />
        </FormField>
        <FormField label="Details">
          <TextAreaControl
            value={detail}
            required
            disabled={busy}
            placeholder="Concrete evidence, expected behavior, and impact"
            onChange={(event) => setDetail(event.target.value)}
            aria-label="Friction detail"
          />
        </FormField>
        <div className="friction-action-row">
          <FormField label="Category">
            <SelectControl
              value={category}
              disabled={busy}
              onChange={(event) =>
                setCategory(event.target.value as FrictionCategory)
              }
              aria-label="Friction category"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectControl>
          </FormField>
          <FormField label="Severity">
            <SelectControl
              value={severity}
              disabled={busy}
              onChange={(event) =>
                setSeverity(event.target.value as FrictionSeverity)
              }
              aria-label="Friction severity"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </SelectControl>
          </FormField>
        </div>
        <button type="submit" disabled={busy || !summary.trim() || !detail.trim()}>
          Capture
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </form>

      <div className="friction-counts" aria-label="Friction lifecycle counts">
        <span>Captured {frictions.filter((row) => row.status === "captured").length}</span>
        <span>Evaluated {frictions.filter((row) => row.status === "evaluated").length}</span>
        <span>Responded {frictions.filter((row) => row.status === "responded").length}</span>
      </div>

      {frictions.length === 0 ? (
        <p className="muted">No friction captured yet.</p>
      ) : (
        <ul className="skills-list friction-list">
          {frictions.map((friction) => (
            <li key={friction.id} className="receipt-batch friction-card">
              <div className="friction-title">
                <strong>{friction.summary}</strong>
                <span className={`friction-status ${friction.status}`}>
                  {friction.status}
                </span>
              </div>
              <p className="muted tight">
                {friction.category} · {friction.severity} · {friction.source}
                {friction.threadId ? ` · thread ${friction.threadId.slice(0, 8)}` : ""}
              </p>
              <p className="tight">{friction.detail}</p>

              {friction.status === "captured" ? (
                <div className="friction-action">
                  <div className="friction-action-head">
                    <strong>Record verdict</strong>
                    <span>Evaluate and assign an owner</span>
                  </div>
                  <div className="friction-action-row">
                    <FormField label="Outcome">
                      <SelectControl
                        value={outcomeById[friction.id] ?? "confirmed"}
                        disabled={busy}
                        onChange={(event) =>
                          setOutcomeById((previous) => ({
                            ...previous,
                            [friction.id]: event.target
                              .value as FrictionVerdictOutcome,
                          }))
                        }
                        aria-label={`Verdict outcome for ${friction.summary}`}
                      >
                        {OUTCOMES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </SelectControl>
                    </FormField>
                    <FormField label="Owner">
                      <TextControl
                        value={ownerById[friction.id] ?? "builder"}
                        required
                        disabled={busy}
                        placeholder="Responsible owner"
                        onChange={(event) =>
                          setOwnerById((previous) => ({
                            ...previous,
                            [friction.id]: event.target.value,
                          }))
                        }
                        aria-label={`Owner for ${friction.summary}`}
                      />
                    </FormField>
                  </div>
                  <FormField label="Rationale">
                    <TextAreaControl
                      value={rationaleById[friction.id] ?? ""}
                      required
                      disabled={busy}
                      placeholder="Why did you reach this verdict?"
                      onChange={(event) =>
                        setRationaleById((previous) => ({
                          ...previous,
                          [friction.id]: event.target.value,
                        }))
                      }
                      aria-label={`Verdict rationale for ${friction.summary}`}
                    />
                  </FormField>
                  <button
                    type="button"
                    disabled={busy || !(rationaleById[friction.id] ?? "").trim()}
                    onClick={() => void submitVerdict(friction)}
                  >
                    Set verdict
                  </button>
                </div>
              ) : null}

              {friction.verdict ? (
                <p className="friction-verdict tight">
                  Verdict: {friction.verdict.outcome} · owner {friction.verdict.ownerId}
                  {" · "}
                  {friction.verdict.rationale}
                </p>
              ) : null}

              {friction.status === "evaluated" ? (
                <div className="friction-action">
                  <div className="friction-action-head">
                    <strong>Owner response</strong>
                    <span>Assigned to {friction.verdict?.ownerId}</span>
                  </div>
                  <FormField label="Disposition">
                    <SelectControl
                      value={dispositionById[friction.id] ?? "planned"}
                      disabled={busy}
                      onChange={(event) =>
                        setDispositionById((previous) => ({
                          ...previous,
                          [friction.id]: event.target
                            .value as OwnerResponseDisposition,
                        }))
                      }
                      aria-label={`Owner disposition for ${friction.summary}`}
                    >
                      {DISPOSITIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </SelectControl>
                  </FormField>
                  <FormField label="Response note">
                    <TextAreaControl
                      value={responseById[friction.id] ?? ""}
                      required
                      disabled={busy}
                      placeholder={`What will ${friction.verdict?.ownerId} do next?`}
                      onChange={(event) =>
                        setResponseById((previous) => ({
                          ...previous,
                          [friction.id]: event.target.value,
                        }))
                      }
                      aria-label={`Owner response for ${friction.summary}`}
                    />
                  </FormField>
                  <button
                    type="button"
                    disabled={busy || !(responseById[friction.id] ?? "").trim()}
                    onClick={() => void submitResponse(friction)}
                  >
                    Record response
                  </button>
                </div>
              ) : null}

              {friction.ownerResponse ? (
                <p className="friction-response tight">
                  Owner response: {friction.ownerResponse.disposition} ·{" "}
                  {friction.ownerResponse.note}
                </p>
              ) : null}

              <p className="muted tight">
                Audit:{" "}
                {friction.events
                  .map((event) => `${event.type} by ${event.actorId}`)
                  .join(" → ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

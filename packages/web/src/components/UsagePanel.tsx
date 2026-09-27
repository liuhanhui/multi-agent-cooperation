import { useState } from "react";
import type { CatConfig, UsageBucket } from "@mac/shared";
import { resolveCatBreed } from "../chat/cat-breed";
import { formatCost, formatTokens } from "../features/usage/format-usage";
import { useUsageSummary } from "../hooks/useUsageSummary";
import { CatPortrait } from "./CatPortrait";

interface UsagePanelProps {
  cats: CatConfig[];
  /** Selected room; enables the "This thread" scope. */
  activeThreadId: string | null;
  /** Bumps when the live thread gains a usage-bearing bubble (triggers refetch). */
  refreshKey: number;
}

type Scope = "all" | "thread";

const DAY_OPTIONS = [1, 7, 30] as const;

/**
 * M29 token usage dashboard: totals, daily bars, per-cat / per-provider split, recent turns.
 * Read-only projection of `GET /api/usage`; never computes usage on its own.
 * @param props.cats - Registry for names and breed portraits
 * @param props.activeThreadId - Current room for thread scope
 * @param props.refreshKey - Live-update trigger from the chat stream
 * @returns Usage shelf panel
 */
export function UsagePanel({ cats, activeThreadId, refreshKey }: UsagePanelProps) {
  const [days, setDays] = useState<number>(7);
  const [scope, setScope] = useState<Scope>("all");
  // Fall back to all threads when no room is selected.
  const threadId = scope === "thread" ? activeThreadId : null;
  const { summary, status } = useUsageSummary(days, threadId, refreshKey);

  const catName = (id: string) => cats.find((c) => c.id === id)?.displayName ?? id;
  const maxDay = Math.max(1, ...(summary?.byDay.map((d) => d.totalTokens) ?? [0]));
  const maxCat = Math.max(1, ...(summary?.byCat.map((c) => c.totalTokens) ?? [0]));

  return (
    <aside className="skills-panel usage-panel" aria-label="Token usage">
      <header className="skills-head">
        <h2>Usage</h2>
        <p className="muted tight">Per-turn tokens reported by each cat's CLI</p>
      </header>

      <div className="usage-controls">
        <div className="usage-segment" role="group" aria-label="Scope">
          <button
            type="button"
            className={scope === "all" ? "active" : ""}
            onClick={() => setScope("all")}
          >
            All threads
          </button>
          <button
            type="button"
            className={scope === "thread" ? "active" : ""}
            disabled={!activeThreadId}
            onClick={() => setScope("thread")}
          >
            This thread
          </button>
        </div>
        <div className="usage-segment" role="group" aria-label="Days">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={days === d ? "active" : ""}
              onClick={() => setDays(d)}
            >
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {status === "unavailable" ? (
        <p className="muted usage-note">Usage ledger unavailable — showing last result.</p>
      ) : null}

      {!summary ? (
        <p className="muted">Loading usage…</p>
      ) : (
        <>
          <div className="usage-totals">
            <UsageStat label="Total" value={formatTokens(summary.totals.totalTokens)} />
            <UsageStat label="Input" value={formatTokens(summary.totals.inputTokens)} />
            <UsageStat label="Output" value={formatTokens(summary.totals.outputTokens)} />
            <UsageStat label="Cache read" value={formatTokens(summary.totals.cacheReadTokens)} />
            <UsageStat label="Turns" value={String(summary.totals.turns)} />
            <UsageStat label="Cost" value={formatCost(summary.totals.costUsd)} />
          </div>
          {summary.totals.estimatedTurns > 0 ? (
            <p className="muted usage-note">
              {summary.totals.estimatedTurns} of {summary.totals.turns} turns are estimates
              (fake provider, ~4 chars/token).
            </p>
          ) : null}

          {summary.totals.turns === 0 ? (
            <p className="muted usage-note">
              No usage recorded in this window. Invoke a cat and its turn will appear here.
            </p>
          ) : (
            <>
              <section className="usage-section" aria-label="Daily tokens">
                <h3>Daily</h3>
                <div className="usage-bars">
                  {summary.byDay.map((day) => (
                    <div
                      key={day.key}
                      className="usage-bar-col"
                      title={`${day.key}: ${day.totalTokens} tokens · ${day.turns} turns`}
                    >
                      <div
                        className="usage-bar"
                        style={{ height: `${Math.round((day.totalTokens / maxDay) * 100)}%` }}
                      />
                      {summary.byDay.length <= 7 ? (
                        <span className="usage-bar-label">{day.key.slice(5)}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="usage-section" aria-label="Tokens by cat">
                <h3>By cat</h3>
                <ul className="usage-rows">
                  {summary.byCat.map((bucket) => (
                    <li key={bucket.key} className="usage-row">
                      {cats.some((c) => c.id === bucket.key) ? (
                        <CatPortrait catId={bucket.key} displayName={catName(bucket.key)} size="sm" />
                      ) : null}
                      <div className="usage-row-main">
                        <div className="usage-row-head">
                          <span>
                            {catName(bucket.key)}
                            {cats.some((c) => c.id === bucket.key) ? (
                              <span className="muted"> · {resolveCatBreed(bucket.key).breedLabel}</span>
                            ) : null}
                          </span>
                          <BucketFigures bucket={bucket} />
                        </div>
                        <div className="usage-meter">
                          <span
                            style={{ width: `${Math.round((bucket.totalTokens / maxCat) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="usage-section" aria-label="Tokens by provider">
                <h3>By provider</h3>
                <ul className="usage-rows">
                  {summary.byProvider.map((bucket) => (
                    <li key={bucket.key} className="usage-row">
                      <div className="usage-row-main">
                        <div className="usage-row-head">
                          <span>{bucket.key}</span>
                          <BucketFigures bucket={bucket} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="usage-section" aria-label="Recent turns">
                <h3>Recent turns</h3>
                <ul className="usage-recent">
                  {summary.recent.map((record) => (
                    <li key={record.id}>
                      <span>{catName(record.catId)}</span>
                      <span className="muted">
                        {new Date(record.createdAt).toLocaleString()}
                      </span>
                      <span>
                        {record.estimated ? "~" : ""}
                        {formatTokens(record.totalTokens)} tok
                        {record.costUsd !== null ? ` · ${formatCost(record.costUsd)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </aside>
  );
}

/**
 * One headline figure in the totals grid.
 * @param props.label - Caption
 * @param props.value - Preformatted value
 * @returns Stat tile
 */
function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="usage-stat">
      <span className="usage-stat-value">{value}</span>
      <span className="usage-stat-label">{label}</span>
    </div>
  );
}

/**
 * Compact "tokens · turns · cost" figures for a bucket row.
 * @param props.bucket - Aggregated bucket
 * @returns Inline figures
 */
function BucketFigures({ bucket }: { bucket: UsageBucket }) {
  return (
    <span className="muted usage-figures">
      {formatTokens(bucket.totalTokens)} tok · {bucket.turns} turns
      {bucket.costUsd > 0 ? ` · ${formatCost(bucket.costUsd)}` : ""}
    </span>
  );
}

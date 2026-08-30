import { useEffect, useState } from "react";
import type { HealthResponse } from "@mac/shared";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/health")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as HealthResponse;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <p className="brand">Multi-Agent Cooperation</p>
      <h1>Platform layer above Agent CLIs</h1>
      <p className="lede">
        Wave 0 scaffold is up. Next: threads, streaming, and the first agent adapter.
      </p>
      <section className="panel" aria-live="polite">
        <h2>API health</h2>
        {error ? <p className="err">Unreachable: {error}</p> : null}
        {health ? (
          <dl>
            <div>
              <dt>status</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>store</dt>
              <dd>{health.store}</dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{health.version}</dd>
            </div>
          </dl>
        ) : !error ? (
          <p>Checking…</p>
        ) : null}
      </section>
    </main>
  );
}

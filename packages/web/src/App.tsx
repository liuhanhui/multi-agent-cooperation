import { useEffect, useRef, useState } from "react";
import type { CatConfig, HealthResponse, Message, PlatformEvent, Thread } from "@mac/shared";

function wsUrl(threadId: string, afterSeq: number): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws?threadId=${encodeURIComponent(threadId)}&afterSeq=${afterSeq}`;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cats, setCats] = useState<CatConfig[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [wsState, setWsState] = useState<"idle" | "connecting" | "live" | "down">("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSeqRef = useRef(0);
  const messagesEnd = useRef<HTMLDivElement | null>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    fetch("/health")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as HealthResponse;
      })
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void refreshThreads();
    void refreshCats();
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeId) {
      setWsState("idle");
      return;
    }
    let closed = false;
    setWsState("connecting");
    setMessages([]);
    const afterSeq = 0;
    lastSeqRef.current = 0;
    const ws = new WebSocket(wsUrl(activeId, afterSeq));

    ws.onopen = () => {
      if (!closed) setWsState("live");
    };
    ws.onclose = () => {
      if (!closed) setWsState("down");
    };
    ws.onerror = () => {
      if (!closed) setWsState("down");
    };
    ws.onmessage = (ev) => {
      // React StrictMode remounts effects; ignore events from the disposed socket.
      if (closed) return;
      const event = JSON.parse(String(ev.data)) as PlatformEvent | { type: string; error?: string };
      if (event.type === "error") {
        setError(event.error ?? "ws error");
        return;
      }
      const pe = event as PlatformEvent;
      if (pe.type === "thread.hydrated") {
        setMessages(pe.messages);
        lastSeqRef.current = pe.messages.at(-1)?.seq ?? 0;
        return;
      }
      if (pe.type === "message.created") {
        setMessages((prev) => upsertMessage(prev, pe.message));
        lastSeqRef.current = Math.max(lastSeqRef.current, pe.message.seq);
        return;
      }
      if (pe.type === "message.delta") {
        setMessages((prev) => applyDelta(prev, pe.messageId, pe.threadId, pe.seq, pe.delta));
        return;
      }
      if (pe.type === "message.completed" || pe.type === "message.failed") {
        setMessages((prev) => upsertMessage(prev, pe.message));
        lastSeqRef.current = Math.max(lastSeqRef.current, pe.message.seq);
      }
    };

    return () => {
      closed = true;
      ws.close();
    };
  }, [activeId]);

  async function refreshThreads() {
    const res = await fetch("/api/threads");
    if (!res.ok) throw new Error(`list threads HTTP ${res.status}`);
    const data = (await res.json()) as { threads: Thread[] };
    setThreads(data.threads);
  }

  async function refreshCats() {
    const res = await fetch("/api/cats");
    if (!res.ok) throw new Error(`list cats HTTP ${res.status}`);
    const data = (await res.json()) as { cats: CatConfig[] };
    setCats(data.cats);
  }

  async function setDefaultCat(catId: string) {
    if (!activeId) return;
    setError(null);
    const thread = threads.find((t) => t.id === activeId);
    const memberIds = thread?.memberIds?.length ? thread.memberIds : cats.map((c) => c.id);
    const res = await fetch(`/api/threads/${activeId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberIds, defaultCatId: catId }),
    });
    if (!res.ok) {
      setError(`set default cat HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as { thread: Thread };
    setThreads((prev) => prev.map((t) => (t.id === data.thread.id ? data.thread : t)));
  }

  async function createThread() {
    setError(null);
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim() || undefined }),
    });
    if (!res.ok) {
      setError(`create thread HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as { thread: Thread };
    setTitle("");
    await refreshThreads();
    setActiveId(data.thread.id);
  }

  async function sendMessage(mode: "invoke" | "append" | "echo") {
    if (!activeId || !draft.trim()) return;
    setError(null);
    const path =
      mode === "echo"
        ? `/api/threads/${activeId}/messages/stream-echo`
        : mode === "invoke"
          ? `/api/threads/${activeId}/messages/invoke`
          : `/api/threads/${activeId}/messages`;
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    if (!res.ok && res.status !== 202) {
      setError(`send HTTP ${res.status}`);
      return;
    }
    setDraft("");
    await refreshThreads();
  }

  return (
    <main className="shell app">
      <header className="top">
        <p className="brand">Multi-Agent Cooperation</p>
        <p className="lede tight">
          M05 — pick a default cat, then Send invokes with that cat&apos;s system snippet.
        </p>
        <p className="meta">
          health:{" "}
          {health
            ? `${health.status}/${health.store}${health.agent ? `/${health.agent}` : ""}`
            : "…"}{" "}
          · ws: {wsState}
        </p>
        {error ? <p className="err">{error}</p> : null}
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New thread title"
              aria-label="New thread title"
            />
            <button type="button" onClick={() => void createThread()}>
              Create
            </button>
          </div>
          <ul className="thread-list">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={t.id === activeId ? "active" : undefined}
                  onClick={() => setActiveId(t.id)}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="chat">
          {!activeId ? (
            <p className="muted">Select or create a thread.</p>
          ) : (
            <>
              <div className="row cat-row">
                <label htmlFor="default-cat">Default cat</label>
                <select
                  id="default-cat"
                  value={activeThread?.defaultCatId ?? ""}
                  onChange={(e) => void setDefaultCat(e.target.value)}
                >
                  {(activeThread?.memberIds?.length
                    ? cats.filter((c) => activeThread.memberIds.includes(c.id))
                    : cats
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="messages" aria-live="polite">
                {messages.map((m) => (
                  <article key={m.id} className={`bubble ${m.role}`}>
                    <header>
                      <span>{m.authorId}</span>
                      <span className="muted">
                        #{m.seq} · {m.status}
                      </span>
                    </header>
                    <p>
                      {m.content ||
                        (m.status === "streaming"
                          ? "…"
                          : m.status === "failed"
                            ? (m.error ?? "failed")
                            : "")}
                    </p>
                  </article>
                ))}
                <div ref={messagesEnd} />
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage("invoke");
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message…"
                  aria-label="Message"
                />
                <button type="submit">Send</button>
                <button type="button" onClick={() => void sendMessage("echo")}>
                  Echo stream
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function upsertMessage(prev: Message[], message: Message): Message[] {
  const idx = prev.findIndex((m) => m.id === message.id);
  if (idx === -1) return [...prev, message].sort((a, b) => a.seq - b.seq);
  const next = [...prev];
  next[idx] = message;
  return next;
}

/** Apply a stream chunk; create a placeholder bubble if created event was missed. */
function applyDelta(
  prev: Message[],
  messageId: string,
  threadId: string,
  seq: number,
  delta: string,
): Message[] {
  const idx = prev.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    const placeholder: Message = {
      id: messageId,
      threadId,
      seq,
      role: "assistant",
      authorId: "echo",
      content: delta,
      status: "streaming",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return [...prev, placeholder].sort((a, b) => a.seq - b.seq);
  }
  const current = prev[idx];
  if (!current || current.status === "completed" || current.status === "failed") return prev;
  const next = [...prev];
  next[idx] = {
    ...current,
    content: current.content + delta,
    status: "streaming",
  };
  return next;
}

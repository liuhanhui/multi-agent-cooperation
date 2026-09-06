import { useEffect, useReducer, useRef, useState } from "react";
import type { CatConfig, HealthResponse, PlatformEvent, Thread } from "@mac/shared";
import { bubbleReducer } from "./chat/bubble-reducer";
import { mentionSuggestion, parseMentions } from "./chat/mention";
import { ChatPanel } from "./components/ChatPanel";
import { ThreadSidebar } from "./components/ThreadSidebar";

const ACTIVE_THREAD_KEY = "mac.activeThreadId";

function wsUrl(threadId: string, afterSeq: number): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws?threadId=${encodeURIComponent(threadId)}&afterSeq=${afterSeq}`;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cats, setCats] = useState<CatConfig[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() =>
    sessionStorage.getItem(ACTIVE_THREAD_KEY),
  );
  const [messages, dispatchBubbles] = useReducer(bubbleReducer, []);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [wsState, setWsState] = useState<"idle" | "connecting" | "live" | "down">("idle");
  const [error, setError] = useState<string | null>(null);
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
    if (activeId) sessionStorage.setItem(ACTIVE_THREAD_KEY, activeId);
    else sessionStorage.removeItem(ACTIVE_THREAD_KEY);
  }, [activeId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeId) {
      setWsState("idle");
      dispatchBubbles({ type: "reset" });
      return;
    }
    let closed = false;
    setWsState("connecting");
    dispatchBubbles({ type: "reset" });
    const ws = new WebSocket(wsUrl(activeId, 0));

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
      if (closed) return;
      const event = JSON.parse(String(ev.data)) as PlatformEvent | { type: string; error?: string };
      if (event.type === "error") {
        setError(event.error ?? "ws error");
        return;
      }
      dispatchBubbles({ type: "event", event: event as PlatformEvent });
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
    const saved = sessionStorage.getItem(ACTIVE_THREAD_KEY);
    if (saved && data.threads.some((t) => t.id === saved)) {
      setActiveId(saved);
    }
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

  /**
   * Insert `@defaultCat ` at the start of the composer when it does not already
   * begin with a mention. Used by the ChatPanel "@" button.
   * @returns void (updates draft state)
   */
  function insertMention() {
    const cat =
      cats.find((c) => c.id === activeThread?.defaultCatId) ?? cats[0] ?? null;
    const prefix = mentionSuggestion(cat);
    if (!prefix) return;
    setDraft((prev) => (prev.startsWith("@") ? prev : `${prefix}${prev}`));
  }

  /**
   * Send the composer draft: echo streams locally, invoke uses server @mention routing.
   * @param mode - `invoke` runs agent(s); `echo` is the stream demo without an agent
   * @returns Promise that settles after HTTP + thread list refresh
   */
  async function sendMessage(mode: "invoke" | "echo") {
    if (!activeId || !draft.trim()) return;
    setError(null);

    if (mode === "echo") {
      const res = await fetch(`/api/threads/${activeId}/messages/stream-echo`, {
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
      return;
    }

    // Client-side preview only; server re-parses and is the routing authority.
    const preview = parseMentions(draft, cats);
    if (preview.unresolved.length > 0) {
      setError(`Unknown mention: @${preview.unresolved[0]}`);
      return;
    }
    if (preview.targets.length > 0 && !preview.prompt.trim()) {
      setError("Add a message after @cat (e.g. @architect @reviewer design the API)");
      return;
    }

    // Send raw draft so the API can resolve multi-target @A @B itself.
    const res = await fetch(`/api/threads/${activeId}/messages/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    if (!res.ok && res.status !== 202) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `send HTTP ${res.status}`);
      return;
    }
    setDraft("");
    await refreshThreads();
  }

  return (
    <main className="shell app">
      <header className="top">
        <p className="brand">Multi-Agent Cooperation</p>
        <h1 className="page-title">Chat</h1>
        <p className="lede tight">
          Wave 2 — @A only A; @A @B serial; no mention uses default cat.
        </p>
        <p className="meta">
          health:{" "}
          {health
            ? `${health.status}/${health.store}${health.agent ? `/${health.agent}` : ""}`
            : "…"}{" "}
          · cats: {cats.length}
        </p>
        {error ? <p className="err">{error}</p> : null}
      </header>

      <div className="layout">
        <ThreadSidebar
          threads={threads}
          cats={cats}
          activeId={activeId}
          title={title}
          onTitleChange={setTitle}
          onCreate={() => void createThread()}
          onSelect={setActiveId}
        />

        {!activeThread ? (
          <section className="chat">
            <p className="muted empty">Select or create a thread to start chatting.</p>
          </section>
        ) : (
          <ChatPanel
            thread={activeThread}
            cats={cats}
            messages={messages}
            draft={draft}
            wsState={wsState}
            messagesEndRef={messagesEnd}
            onDraftChange={setDraft}
            onDefaultCatChange={(id) => void setDefaultCat(id)}
            onInsertMention={insertMention}
            onSend={() => void sendMessage("invoke")}
            onEcho={() => void sendMessage("echo")}
          />
        )}
      </div>
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { invokeMessage, streamEchoMessage } from "../api/endpoints";
import { mentionSuggestion, parseMentions } from "../chat/mention";
import { ChatPanel } from "../components/ChatPanel";
import { SkillsPanel } from "../components/SkillsPanel";
import { ThreadSidebar } from "../components/ThreadSidebar";
import { useThreadSocket } from "../hooks/useThreadSocket";
import { useWorkspaceData } from "../hooks/useWorkspaceData";

/**
 * Chat shell: wires workspace data, WS bubbles, skills browse, and composer UX.
 * Composition root only — HTTP/WS/routing live in api/ + hooks/ + shared.
 */
export function App() {
  const {
    health,
    cats,
    threads,
    skills,
    skillsBudget,
    selectedSkillId,
    selectedSkillBody,
    selectSkill,
    activeId,
    setActiveId,
    title,
    setTitle,
    error,
    setError,
    refreshThreads,
    createThread,
    setDefaultCat,
  } = useWorkspaceData();

  // Stabilize for useThreadSocket effect deps (setError identity is stable from useState).
  const onWsError = useCallback((message: string) => setError(message), [setError]);
  const { messages, wsState } = useThreadSocket(activeId, onWsError);

  const [draft, setDraft] = useState("");
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Insert `@defaultCat ` at the start of the composer when it does not already
   * begin with a mention. Used by the ChatPanel "@" button.
   */
  function insertMention(): void {
    const cat =
      cats.find((c) => c.id === activeThread?.defaultCatId) ?? cats[0] ?? null;
    const prefix = mentionSuggestion(cat);
    if (!prefix) return;
    setDraft((prev) => (prev.startsWith("@") ? prev : `${prefix}${prev}`));
  }

  /**
   * Send the composer draft: echo streams locally, invoke uses server @mention routing.
   * @param mode - `invoke` runs agent(s); `echo` is the stream demo without an agent
   */
  async function sendMessage(mode: "invoke" | "echo"): Promise<void> {
    if (!activeId || !draft.trim()) return;
    setError(null);

    try {
      if (mode === "echo") {
        await streamEchoMessage(activeId, draft.trim());
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

      await invokeMessage(activeId, draft.trim());
      setDraft("");
      await refreshThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="shell app">
      <header className="top">
        <p className="brand">Multi-Agent Cooperation</p>
        <h1 className="page-title">Chat</h1>
        <p className="lede tight">
          Wave 3 — skills inject on trigger words (TDD / review / debug); Hub lists the catalog.
        </p>
        <p className="meta">
          health:{" "}
          {health
            ? `${health.status}/${health.store}${health.agent ? `/${health.agent}` : ""}`
            : "…"}{" "}
          · cats: {cats.length} · skills: {skills.length}
        </p>
        {error ? <p className="err">{error}</p> : null}
      </header>

      <div className="layout layout-with-skills">
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

        <SkillsPanel
          skills={skills}
          tokenBudget={skillsBudget}
          selectedId={selectedSkillId}
          detailBody={selectedSkillBody}
          onSelect={(id) => void selectSkill(id)}
        />
      </div>
    </main>
  );
}

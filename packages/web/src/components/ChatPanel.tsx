import type { RefObject } from "react";
import type { CatConfig, Message, Thread } from "@mac/shared";
import { Bubble } from "./Bubble";

interface ChatPanelProps {
  thread: Thread;
  cats: CatConfig[];
  messages: Message[];
  draft: string;
  wsState: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onDefaultCatChange: (catId: string) => void;
  onInsertMention: () => void;
  onSend: () => void;
  onEcho: () => void;
}

export function ChatPanel({
  thread,
  cats,
  messages,
  draft,
  wsState,
  messagesEndRef,
  onDraftChange,
  onDefaultCatChange,
  onInsertMention,
  onSend,
  onEcho,
}: ChatPanelProps) {
  const memberCats = thread.memberIds?.length
    ? cats.filter((c) => thread.memberIds.includes(c.id))
    : cats;
  const defaultCat = cats.find((c) => c.id === thread.defaultCatId) ?? memberCats[0];

  return (
    <section className="chat">
      <div className="chat-toolbar">
        <div className="row cat-row">
          <label htmlFor="default-cat">Default cat</label>
          <select
            id="default-cat"
            value={thread.defaultCatId ?? ""}
            onChange={(e) => onDefaultCatChange(e.target.value)}
          >
            {memberCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} ({c.role})
              </option>
            ))}
          </select>
          <button type="button" className="ghost" onClick={onInsertMention} title="Insert @default cat">
            @mention
          </button>
        </div>
        <p className="chat-hint muted">
          ws:{wsState} · Send routes to {defaultCat?.displayName ?? "default"} · try{" "}
          <code>@{defaultCat?.id ?? "architect"} hello</code>
        </p>
      </div>

      <div className="messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="muted empty">No messages yet. Mention a cat or just Send.</p>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} cats={cats} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={`Message…  or  @${defaultCat?.id ?? "architect"} …`}
          aria-label="Message"
        />
        <button type="submit">Send</button>
        <button type="button" className="ghost" onClick={onEcho}>
          Echo
        </button>
      </form>
    </section>
  );
}

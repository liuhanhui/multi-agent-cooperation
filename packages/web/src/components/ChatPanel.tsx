import type { RefObject } from "react";
import type { CatConfig, HubBlockAction, Message, Thread } from "@mac/shared";
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
  onBlockAction?: (messageId: string, action: HubBlockAction) => void;
  actionBusy?: boolean;
}

/**
 * Active-thread chat surface: default-cat picker, bubble list, and composer.
 * @param props.thread - Active thread (members + defaultCatId)
 * @param props.cats - Registry used for labels/avatars and membership filter
 * @param props.messages - Bubble reducer state for this thread
 * @param props.draft / onDraftChange - Composer controlled input
 * @param props.onInsertMention - Prefix `@defaultCat ` into the draft
 * @param props.onSend / onEcho - Invoke routed agents vs stream-echo demo
 * @param props.onBlockAction - Hub checklist/decision write-back (M14)
 * @param props.actionBusy - Disable block controls while posting
 */
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
  onBlockAction,
  actionBusy,
}: ChatPanelProps) {
  const memberCats = thread.memberIds?.length
    ? cats.filter((c) => thread.memberIds.includes(c.id))
    : cats;
  const defaultCat = cats.find((c) => c.id === thread.defaultCatId) ?? memberCats[0];
  const secondCat = memberCats.find((c) => c.id !== defaultCat?.id) ?? memberCats[1];

  return (
    <section className="chat">
      <div className="chat-toolbar">
        <div className="row cat-row">
          <label htmlFor="default-cat">Lead cat</label>
          <select
            id="default-cat"
            value={thread.defaultCatId ?? defaultCat?.id ?? ""}
            onChange={(e) => onDefaultCatChange(e.target.value)}
            disabled={memberCats.length === 0}
          >
            {memberCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" onClick={onInsertMention} title="Insert @default cat">
            @call
          </button>
        </div>
        <p className="chat-hint muted">
          live · {wsState} · no @ → {defaultCat?.displayName ?? "default"} · try{" "}
          <code>@{defaultCat?.id ?? "architect"} hello</code>
          {secondCat ? (
            <>
              {" "}
              or{" "}
              <code>
                @{defaultCat?.id ?? "architect"} @{secondCat.id} please design
              </code>
            </>
          ) : null}
        </p>
      </div>

      <div className="messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty">
            <div className="paw-trail" aria-hidden="true">
              <span className="paw soft lg" />
              <span className="paw mint" />
              <span className="paw soft" />
            </div>
            <p className="chat-empty-title">Say hello</p>
            <p className="muted tight">
              Mention a cat, or just Send — the lead cat will pick up the yarn.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              cats={cats}
              onBlockAction={onBlockAction}
              actionBusy={actionBusy}
            />
          ))
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
          placeholder={`Whisper to the lounge…  or  @${defaultCat?.id ?? "architect"} …`}
          aria-label="Message"
        />
        <button type="submit">
          <span className="paw" aria-hidden="true" />
          Send
        </button>
        <button type="button" className="ghost" onClick={onEcho}>
          Echo
        </button>
      </form>
    </section>
  );
}

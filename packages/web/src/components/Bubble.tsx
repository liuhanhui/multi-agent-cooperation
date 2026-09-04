import type { CatConfig, Message } from "@mac/shared";
import { avatarInitials, avatarTone } from "../chat/avatar";

interface BubbleProps {
  message: Message;
  cats: CatConfig[];
}

export function Bubble({ message, cats }: BubbleProps) {
  const cat = cats.find((c) => c.id === message.authorId);
  const label = cat?.displayName ?? message.authorId;
  const tone = avatarTone(message.authorId);
  const body =
    message.content ||
    (message.status === "streaming"
      ? "…"
      : message.status === "failed"
        ? (message.error ?? "failed")
        : "");

  return (
    <article className={`bubble ${message.role}`} data-message-id={message.id}>
      <div className="bubble-row">
        <span className="avatar" style={{ background: tone }} aria-hidden="true">
          {avatarInitials(label)}
        </span>
        <div className="bubble-body">
          <header>
            <span className="author">{label}</span>
            <span className="muted">
              #{message.seq} · {message.status}
            </span>
          </header>
          <p>
            {body}
            {message.status === "streaming" ? <span className="stream-caret" aria-hidden="true" /> : null}
          </p>
        </div>
      </div>
    </article>
  );
}

import { useEffect, useState } from "react";
import type { CatConfig, Message } from "@mac/shared";
import { avatarInitials, avatarTone } from "../chat/avatar";

interface BubbleProps {
  message: Message;
  cats: CatConfig[];
}

/**
 * Format elapsed seconds as m:ss for in-flight agent bubbles.
 * @param totalSeconds - Whole seconds since message.createdAt
 * @returns Display string
 */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * One chat bubble with avatar, status, optional live CLI progress, and body.
 * @param props.message - Bubble from the reducer (may include progress while running)
 * @param props.cats - Registry for display names / tones
 */
export function Bubble({ message, cats }: BubbleProps) {
  const cat = cats.find((c) => c.id === message.authorId);
  const label = cat?.displayName ?? message.authorId;
  const tone = avatarTone(message.authorId);
  const inFlight = message.status === "pending" || message.status === "streaming";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inFlight]);

  const elapsedSec = Math.max(
    0,
    Math.floor((now - Date.parse(message.createdAt)) / 1000),
  );

  const body =
    message.content ||
    (message.status === "failed"
      ? (message.error ?? "failed")
      : message.status === "streaming" || message.status === "pending"
        ? ""
        : "");

  const progressLine =
    inFlight && !message.content
      ? (message.progress ??
        (message.status === "pending"
          ? "Queued — waiting for agent CLI…"
          : "Agent running — waiting for first tokens…"))
      : message.progress && inFlight
        ? message.progress
        : null;

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
              {inFlight ? ` · ${formatElapsed(elapsedSec)}` : ""}
              {cat?.provider ? ` · ${cat.provider}` : ""}
            </span>
          </header>
          {progressLine ? (
            <p className="bubble-progress" role="status" aria-live="polite">
              {progressLine}
            </p>
          ) : null}
          {body || message.status === "streaming" ? (
            <p>
              {body}
              {message.status === "streaming" && message.content ? (
                <span className="stream-caret" aria-hidden="true" />
              ) : null}
              {message.status === "streaming" && !message.content ? (
                <span className="stream-caret" aria-hidden="true" />
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

import { useEffect, useReducer, useState, type Dispatch } from "react";
import type { Message, PlatformEvent } from "@mac/shared";
import { threadWsUrl } from "../api/ws";
import { bubbleReducer, type BubbleAction } from "../chat/bubble-reducer";

export type WsState = "idle" | "connecting" | "live" | "down";

export interface UseThreadSocketResult {
  messages: Message[];
  dispatchBubbles: Dispatch<BubbleAction>;
  wsState: WsState;
}

/**
 * Subscribe to a thread over WebSocket and feed events into the bubble reducer.
 * @param activeId - Thread id to subscribe, or null to reset/idle
 * @param onError - Surface transport/protocol errors to the shell
 * @returns messages, dispatch, and ws connection state
 */
export function useThreadSocket(
  activeId: string | null,
  onError: (message: string) => void,
): UseThreadSocketResult {
  const [messages, dispatchBubbles] = useReducer(bubbleReducer, []);
  const [wsState, setWsState] = useState<WsState>("idle");

  useEffect(() => {
    if (!activeId) {
      setWsState("idle");
      dispatchBubbles({ type: "reset" });
      return;
    }
    let closed = false;
    setWsState("connecting");
    dispatchBubbles({ type: "reset" });
    const ws = new WebSocket(threadWsUrl(activeId, 0));

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
      // Ignore events from a socket disposed by StrictMode remount / thread switch.
      if (closed) return;
      const event = JSON.parse(String(ev.data)) as PlatformEvent | { type: string; error?: string };
      if (event.type === "error") {
        onError(event.error ?? "ws error");
        return;
      }
      dispatchBubbles({ type: "event", event: event as PlatformEvent });
    };

    return () => {
      closed = true;
      ws.close();
    };
  }, [activeId, onError]);

  return { messages, dispatchBubbles, wsState };
}

import type { PlatformEvent } from "@mac/shared";
import { WebSocket } from "ws";

interface Subscriber {
  socket: WebSocket;
  afterSeq: number;
}

/** Fan-out hub for thread-scoped platform events. */
export class ThreadHub {
  private readonly rooms = new Map<string, Set<Subscriber>>();

  subscribe(threadId: string, socket: WebSocket, afterSeq = 0): void {
    let room = this.rooms.get(threadId);
    if (!room) {
      room = new Set();
      this.rooms.set(threadId, room);
    }
    const sub: Subscriber = { socket, afterSeq };
    room.add(sub);
    socket.on("close", () => {
      room?.delete(sub);
      if (room && room.size === 0) this.rooms.delete(threadId);
    });
  }

  publish(threadId: string, event: PlatformEvent): void {
    const room = this.rooms.get(threadId);
    if (!room) return;
    const payload = JSON.stringify(event);
    for (const sub of room) {
      // Use static OPEN — instance.socket.OPEN is undefined on `ws` sockets.
      if (sub.socket.readyState !== WebSocket.OPEN) continue;
      if (event.type === "message.created" || event.type === "message.completed") {
        if (event.message.seq <= sub.afterSeq) continue;
      }
      if (event.type === "message.delta" && event.seq <= sub.afterSeq) continue;
      sub.socket.send(payload);
    }
  }
}

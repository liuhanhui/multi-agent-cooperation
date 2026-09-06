/**
 * Build the browser WebSocket URL for a thread subscription.
 * @param threadId - Thread to hydrate/subscribe
 * @param afterSeq - Resume cursor (0 = full hydrate)
 * @returns ws/wss URL on the current host (Vite proxies /ws → API)
 */
export function threadWsUrl(threadId: string, afterSeq: number): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws?threadId=${encodeURIComponent(threadId)}&afterSeq=${afterSeq}`;
}

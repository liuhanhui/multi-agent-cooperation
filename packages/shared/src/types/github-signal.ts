/**
 * GitHub signal ingress + thread binding (M22).
 * First external channel: PR/issue wait → wake (IM deferred).
 */

/** PR or issue identity used for binding and await matching. */
export interface GithubResourceRef {
  owner: string;
  repo: string;
  number: number;
  kind: "pr" | "issue";
}

/**
 * Durable map: Hub thread ↔ GitHub resource.
 * Optional awaitId links a ball-custody wait for wake-on-event.
 */
export interface GithubThreadBinding {
  id: string;
  threadId: string;
  ref: GithubResourceRef;
  /** Open await to wake when a matching webhook arrives (nullable). */
  awaitId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Normalized webhook after ConnectorRouter ingress (no raw secrets). */
export interface GithubWebhookIngress {
  deliveryId: string;
  event: string;
  action: string | null;
  ref: GithubResourceRef | null;
  summary: string;
}

/**
 * Stable key for owner/repo#number (kind-insensitive for wait matching).
 * @param ref - GitHub resource
 * @returns Lowercased key
 */
export function githubRefKey(ref: GithubResourceRef): string {
  return `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}`;
}

/**
 * Compare two refs by owner/repo/number (kind may differ PR vs issue events).
 * @param a - Left
 * @param b - Right
 * @returns true when same resource number
 */
export function githubRefsEqual(a: GithubResourceRef, b: GithubResourceRef): boolean {
  return githubRefKey(a) === githubRefKey(b);
}

/**
 * Format a short Hub system note for a woken GitHub signal.
 * @param ingress - Normalized event
 * @returns Operator-facing one-liner
 */
export function formatGithubWakeNote(ingress: GithubWebhookIngress): string {
  const ref = ingress.ref
    ? `${ingress.ref.owner}/${ingress.ref.repo}#${ingress.ref.number}`
    : "unknown";
  const action = ingress.action ? ` ${ingress.action}` : "";
  return `[github] ${ingress.event}${action} on ${ref} — ${ingress.summary}`;
}

import { randomBytes, randomUUID } from "node:crypto";
import type {
  CallbackAuthFailure,
  CallbackAuthFailureReason,
  InvocationCredential,
} from "@mac/shared";

export interface MintCredentialInput {
  queueEntryId: string;
  threadId: string;
  catIds: string[];
  /** Time-to-live in milliseconds (default 15 minutes). */
  ttlMs?: number;
}

export type VerifyCredentialResult =
  | { ok: true; credential: InvocationCredential }
  | { ok: false; reason: CallbackAuthFailureReason; detail?: string };

/**
 * In-memory short-lived invocation token store + auth failure telemetry (M10).
 */
export class InvocationCredentialStore {
  private readonly byToken = new Map<string, InvocationCredential>();
  private readonly failures: CallbackAuthFailure[] = [];
  private readonly maxFailures: number;

  /**
   * @param maxFailures - Ring-buffer size for auth denial telemetry
   */
  constructor(maxFailures = 200) {
    this.maxFailures = maxFailures;
  }

  /**
   * Mint a bearer token bound to a queue entry and thread.
   * @param input - queueEntryId, threadId, allowed catIds, optional ttl
   * @returns Public credential fields including the raw token (give once to the agent)
   */
  mint(input: MintCredentialInput): InvocationCredential {
    const now = Date.now();
    const ttlMs = input.ttlMs ?? 15 * 60 * 1000;
    const credential: InvocationCredential = {
      token: randomBytes(24).toString("base64url"),
      queueEntryId: input.queueEntryId,
      threadId: input.threadId,
      catIds: [...input.catIds],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    this.byToken.set(credential.token, credential);
    return credential;
  }

  /**
   * Verify a bearer token for callback use.
   * @param token - Raw token from Authorization header (may be null/empty)
   * @param expectedThreadId - Optional path thread id that must match the credential
   * @returns ok+credential or failure reason (expired is observable)
   */
  verify(token: string | null | undefined, expectedThreadId?: string): VerifyCredentialResult {
    if (!token || !token.trim()) {
      return { ok: false, reason: "missing" };
    }
    const credential = this.byToken.get(token.trim());
    if (!credential) {
      return { ok: false, reason: "invalid" };
    }
    if (Date.parse(credential.expiresAt) <= Date.now()) {
      this.byToken.delete(token.trim());
      return {
        ok: false,
        reason: "expired",
        detail: `expiredAt=${credential.expiresAt}`,
      };
    }
    if (expectedThreadId && credential.threadId !== expectedThreadId) {
      return {
        ok: false,
        reason: "thread_mismatch",
        detail: `tokenThread=${credential.threadId} pathThread=${expectedThreadId}`,
      };
    }
    return { ok: true, credential };
  }

  /**
   * Record an auth denial for operator visibility.
   * @param reason - Failure reason code
   * @param path - HTTP path
   * @param detail - Optional extra context (never the full token)
   */
  recordFailure(reason: CallbackAuthFailureReason, path: string, detail?: string): void {
    this.failures.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      reason,
      path,
      detail,
    });
    while (this.failures.length > this.maxFailures) {
      this.failures.shift();
    }
  }

  /**
   * @returns Recent auth failures (newest last)
   */
  listFailures(): CallbackAuthFailure[] {
    return [...this.failures];
  }

  /**
   * Force-expire a token (tests).
   * @param token - Token to expire
   */
  expireNow(token: string): void {
    const cred = this.byToken.get(token);
    if (!cred) return;
    this.byToken.set(token, {
      ...cred,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  }
}

/**
 * Parse `Authorization: Bearer <token>` (case-insensitive scheme).
 * @param header - Raw Authorization header value
 * @returns Token string or null
 */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1] ?? null;
}

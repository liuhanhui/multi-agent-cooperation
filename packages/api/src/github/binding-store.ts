import { randomUUID } from "node:crypto";
import {
  githubRefKey,
  type GithubResourceRef,
  type GithubThreadBinding,
} from "@mac/shared";

export interface BindGithubInput {
  threadId: string;
  ref: GithubResourceRef;
  awaitId?: string | null;
}

/**
 * In-memory GitHub ↔ thread bindings (M22 signal-ingress).
 * One binding per owner/repo#number; rebinding updates the same key.
 */
export class GithubBindingStore {
  private readonly byKey = new Map<string, GithubThreadBinding>();

  /**
   * Upsert a binding from Hub thread to a PR/issue.
   * @param input - threadId + ref (+ optional awaitId)
   * @returns Persisted binding
   */
  bind(input: BindGithubInput): GithubThreadBinding {
    const threadId = input.threadId.trim();
    if (!threadId) throw new Error("threadId required");
    const ref = normalizeRef(input.ref);
    const key = githubRefKey(ref);
    const now = new Date().toISOString();
    const existing = this.byKey.get(key);
    const binding: GithubThreadBinding = {
      id: existing?.id ?? randomUUID(),
      threadId,
      ref,
      awaitId: input.awaitId?.trim() || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.byKey.set(key, binding);
    return { ...binding, ref: { ...binding.ref } };
  }

  /**
   * @param ref - GitHub resource
   * @returns Binding or undefined
   */
  findByRef(ref: GithubResourceRef): GithubThreadBinding | undefined {
    const hit = this.byKey.get(githubRefKey(normalizeRef(ref)));
    return hit ? { ...hit, ref: { ...hit.ref } } : undefined;
  }

  /**
   * @param threadId - Hub thread
   * @returns Bindings for that thread (newest first)
   */
  listByThread(threadId: string): GithubThreadBinding[] {
    const id = threadId.trim();
    return this.list().filter((b) => b.threadId === id);
  }

  /**
   * @param limit - Max rows
   * @returns Newest bindings first
   */
  list(limit = 40): GithubThreadBinding[] {
    return [...this.byKey.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((b) => ({ ...b, ref: { ...b.ref } }));
  }
}

/**
 * @param ref - Raw ref
 * @returns Trimmed/validated ref
 */
function normalizeRef(ref: GithubResourceRef): GithubResourceRef {
  const owner = ref.owner?.trim() ?? "";
  const repo = ref.repo?.trim() ?? "";
  const number = Number(ref.number);
  if (!owner || !repo) throw new Error("owner and repo required");
  if (!Number.isFinite(number) || number < 1) throw new Error("number must be >= 1");
  if (ref.kind !== "pr" && ref.kind !== "issue") {
    throw new Error("kind must be pr|issue");
  }
  return { owner, repo, number: Math.floor(number), kind: ref.kind };
}

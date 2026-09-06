import type { CatConfig, MentionRoutingStrategy, Thread } from "@mac/shared";
import { parseMentions } from "@mac/shared";

/**
 * Successful routing decision for one invoke turn.
 * - catIds: ordered targets to invoke (serial = one after another)
 * - prompt: text passed to each agent (mentions stripped when present)
 * - strategy: multi-target execution policy
 */
export interface ResolvedMentionRoute {
  ok: true;
  catIds: string[];
  prompt: string;
  strategy: MentionRoutingStrategy;
}

/** Failed routing decision with a client-safe error string. */
export interface ResolvedMentionRouteError {
  ok: false;
  error: string;
}

export type ResolveMentionRouteResult = ResolvedMentionRoute | ResolvedMentionRouteError;

export interface ResolveMentionRouteParams {
  /** Raw operator content (may include leading @mentions). */
  content: string;
  /** Thread supplying defaultCatId and membership gate. */
  thread: Thread;
  /** Registry cats used for token resolution and systemSnippet later. */
  cats: CatConfig[];
  /**
   * Optional single-target override when content has no leading mentions
   * (legacy M06 client: stripped prompt + catId).
   */
  explicitCatId?: string;
  /** Multi-target policy; only `serial` is implemented in M07. */
  strategy?: MentionRoutingStrategy;
}

/**
 * Resolve who should answer an invoke and what prompt they see.
 * Mentions in the leading run win over `explicitCatId`; no mentions fall back
 * to explicitCatId then thread.defaultCatId.
 * @param params - content, thread, cats, optional explicitCatId/strategy
 * @returns ok route with ordered catIds, or ok:false with error
 */
export function resolveMentionRoute(
  params: ResolveMentionRouteParams,
): ResolveMentionRouteResult {
  const strategy = params.strategy ?? "serial";
  // Parallel is declared in the shared enum but not wired until a later milestone.
  if (strategy === "parallel") {
    return { ok: false, error: "parallel mention routing is not implemented yet" };
  }

  const parsed = parseMentions(params.content, params.cats);
  if (parsed.unresolved.length > 0) {
    return {
      ok: false,
      error: `Unknown mention: @${parsed.unresolved[0]}`,
    };
  }

  let catIds: string[];
  let prompt: string;

  if (parsed.targets.length > 0) {
    // Mentions are authoritative so multi-target cannot be collapsed by body.catId.
    catIds = parsed.targets;
    prompt = parsed.prompt;
  } else {
    const fallback = params.explicitCatId ?? params.thread.defaultCatId;
    if (!fallback) {
      return { ok: false, error: "No default cat configured for this thread" };
    }
    catIds = [fallback];
    prompt = parsed.prompt;
  }

  if (!prompt.trim()) {
    return {
      ok: false,
      error: "Add a message after @cat (e.g. @architect design the API)",
    };
  }

  for (const catId of catIds) {
    if (params.thread.memberIds.length > 0 && !params.thread.memberIds.includes(catId)) {
      return { ok: false, error: `Cat ${catId} is not a member of this thread` };
    }
    const known = params.cats.some((c) => c.id === catId);
    // When a registry is provided, unknown ids are rejected (fail closed).
    if (params.cats.length > 0 && !known) {
      return { ok: false, error: `Unknown cat id: ${catId}` };
    }
  }

  return { ok: true, catIds, prompt, strategy };
}

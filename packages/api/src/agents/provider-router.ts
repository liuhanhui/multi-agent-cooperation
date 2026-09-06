import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";

export interface ProviderRouterOptions {
  /** Map of provider id → AgentProvider instance. */
  providers: ReadonlyMap<string, AgentProvider> | Record<string, AgentProvider>;
  /**
   * Resolve which provider id to use for a cat.
   * @param catId - Assistant author / target cat
   * @returns provider id (must exist in providers, or fallback applies)
   */
  resolveProviderId: (catId: string) => string;
  /** Used when catId is missing or resolve returns unknown id. */
  defaultProviderId: string;
}

/**
 * Normalize providers map input.
 * @param providers - Map or plain object
 * @returns Map keyed by provider id
 */
function asMap(
  providers: ReadonlyMap<string, AgentProvider> | Record<string, AgentProvider>,
): Map<string, AgentProvider> {
  if (providers instanceof Map) return new Map(providers);
  return new Map(Object.entries(providers));
}

/**
 * Route each invoke to the CLI adapter declared by the target cat's provider.
 * @param opts - provider map, cat→provider resolver, default id
 * @returns Composite AgentProvider (id "router")
 */
export function createProviderRouter(opts: ProviderRouterOptions): AgentProvider {
  const providers = asMap(opts.providers);
  const { resolveProviderId, defaultProviderId } = opts;

  if (!providers.has(defaultProviderId)) {
    throw new Error(`ProviderRouter defaultProviderId "${defaultProviderId}" is not registered`);
  }

  return {
    id: "router",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      const requested = input.catId ? resolveProviderId(input.catId) : defaultProviderId;
      const provider =
        providers.get(requested) ?? providers.get(defaultProviderId) ?? [...providers.values()][0];
      if (!provider) {
        yield { type: "failed", error: `No agent provider for "${requested}"` };
        return;
      }
      yield* provider.invoke(input);
    },
  };
}

/**
 * Build the default multi-family provider map for process startup.
 * @param factories - Already-constructed adapters keyed by id
 * @returns Map suitable for createProviderRouter
 */
export function buildProviderMap(
  factories: Record<string, AgentProvider>,
): Map<string, AgentProvider> {
  return new Map(Object.entries(factories));
}

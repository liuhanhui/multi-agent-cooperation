/** Declared capability differences across CLI adapter families (M11). */

export type CliOutputFormat = "stream-json" | "jsonl" | "plain";

/**
 * Static capability row for one provider family.
 * Used by Hub/docs and by the router when choosing how to interpret stdout.
 */
export interface ProviderCapability {
  /** Registry / cat.provider id (e.g. claude-code, codex, antigravity). */
  id: string;
  /** Human family label. */
  family: string;
  /** How the CLI emits machine-readable output. */
  outputFormat: CliOutputFormat;
  /** Whether partial token/text deltas are expected before final text. */
  supportsPartialDeltas: boolean;
  /** Whether systemSnippet is forwarded as a native CLI flag (else prepended). */
  supportsSystemSnippetFlag: boolean;
  /** Non-interactive invoke command sketch (documentation only). */
  invokeSketch: string;
}

/**
 * Canonical capability table for shipped adapters.
 * @returns Frozen list of provider capability rows
 */
export function listProviderCapabilities(): readonly ProviderCapability[] {
  return PROVIDER_CAPABILITIES;
}

/**
 * Look up capability by provider id.
 * @param providerId - cat.provider / adapter id
 * @returns Capability or undefined when unknown
 */
export function getProviderCapability(providerId: string): ProviderCapability | undefined {
  return PROVIDER_CAPABILITIES.find((c) => c.id === providerId);
}

const PROVIDER_CAPABILITIES: readonly ProviderCapability[] = [
  {
    id: "claude-code",
    family: "Claude Code",
    outputFormat: "stream-json",
    supportsPartialDeltas: true,
    supportsSystemSnippetFlag: true,
    invokeSketch: "claude -p … --output-format stream-json --include-partial-messages",
  },
  {
    id: "codex",
    family: "Codex CLI",
    outputFormat: "jsonl",
    supportsPartialDeltas: false,
    supportsSystemSnippetFlag: false,
    invokeSketch: "codex exec --json …",
  },
  {
    id: "antigravity",
    family: "Antigravity",
    outputFormat: "stream-json",
    supportsPartialDeltas: true,
    supportsSystemSnippetFlag: false,
    invokeSketch: "agy -p … --output-format stream-json",
  },
  {
    id: "fake",
    family: "Fake (tests)",
    outputFormat: "plain",
    supportsPartialDeltas: true,
    supportsSystemSnippetFlag: true,
    invokeSketch: "(in-process)",
  },
];

import type { Message } from "./types/message.js";
import type {
  ChecklistBlock,
  ContentBlock,
  DecisionBlock,
  HubBlockAction,
} from "./types/content-block.js";

const MAC_BLOCKS_FENCE = /```mac-blocks\s*([\s\S]*?)```/i;

/**
 * Validate and normalize a raw blocks array from JSON / API body.
 * @param raw - Unknown payload (usually parsed JSON)
 * @returns ContentBlock[] or throws Error with reason
 */
export function validateContentBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) throw new Error("blocks must be an array");
  const out: ContentBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("each block must be an object");
    const b = item as Record<string, unknown>;
    const type = b.type;
    const id = typeof b.id === "string" ? b.id.trim() : "";
    if (!id) throw new Error("block.id required");

    if (type === "text") {
      if (typeof b.text !== "string") throw new Error("text block requires text");
      out.push({ type: "text", id, text: b.text });
      continue;
    }
    if (type === "checklist") {
      if (!Array.isArray(b.items)) throw new Error("checklist requires items[]");
      const items = b.items.map((it, i) => {
        if (!it || typeof it !== "object") throw new Error(`checklist item ${i} invalid`);
        const row = it as Record<string, unknown>;
        const itemId = typeof row.id === "string" ? row.id.trim() : "";
        const label = typeof row.label === "string" ? row.label : "";
        if (!itemId || !label) throw new Error(`checklist item ${i} needs id and label`);
        return { id: itemId, label, checked: Boolean(row.checked) };
      });
      out.push({
        type: "checklist",
        id,
        title: typeof b.title === "string" ? b.title : undefined,
        items,
      });
      continue;
    }
    if (type === "decision") {
      if (typeof b.prompt !== "string") throw new Error("decision requires prompt");
      if (!Array.isArray(b.options)) throw new Error("decision requires options[]");
      const options = b.options.map((opt, i) => {
        if (!opt || typeof opt !== "object") throw new Error(`decision option ${i} invalid`);
        const row = opt as Record<string, unknown>;
        const optId = typeof row.id === "string" ? row.id.trim() : "";
        const label = typeof row.label === "string" ? row.label : "";
        if (!optId || !label) throw new Error(`decision option ${i} needs id and label`);
        return { id: optId, label };
      });
      const selectedId =
        b.selectedId === null || b.selectedId === undefined
          ? null
          : typeof b.selectedId === "string"
            ? b.selectedId
            : null;
      out.push({ type: "decision", id, prompt: b.prompt, options, selectedId });
      continue;
    }
    if (type === "diff") {
      if (typeof b.after !== "string") throw new Error("diff requires after");
      out.push({
        type: "diff",
        id,
        after: b.after,
        before: typeof b.before === "string" ? b.before : undefined,
        path: typeof b.path === "string" ? b.path : undefined,
        language: typeof b.language === "string" ? b.language : undefined,
      });
      continue;
    }
    if (type === "card") {
      if (typeof b.title !== "string" || typeof b.body !== "string") {
        throw new Error("card requires title and body");
      }
      const tone =
        b.tone === "info" || b.tone === "warn" || b.tone === "success" ? b.tone : undefined;
      out.push({ type: "card", id, title: b.title, body: b.body, tone });
      continue;
    }
    throw new Error(`unknown block type: ${String(type)}`);
  }
  return out;
}

/**
 * Extract optional ```mac-blocks``` JSON fence from assistant prose.
 * @param content - Raw message content
 * @returns stripped content + blocks (empty when no fence)
 */
export function parseMacBlocksFence(content: string): {
  content: string;
  blocks: ContentBlock[];
} {
  const match = MAC_BLOCKS_FENCE.exec(content);
  if (!match) return { content, blocks: [] };
  const jsonText = match[1]?.trim() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { content, blocks: [] };
  }
  try {
    const blocks = validateContentBlocks(parsed);
    const stripped = content.replace(MAC_BLOCKS_FENCE, "").trim();
    return { content: stripped, blocks };
  } catch {
    return { content, blocks: [] };
  }
}

/**
 * Apply a Hub action to a blocks array (immutable).
 * @param blocks - Existing blocks on the message
 * @param action - checklist.toggle or decision.select
 * @returns New blocks array
 */
export function applyHubBlockAction(
  blocks: ContentBlock[],
  action: HubBlockAction,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.id !== action.blockId) return block;
    if (action.type === "checklist.toggle" && block.type === "checklist") {
      const next: ChecklistBlock = {
        ...block,
        items: block.items.map((item) =>
          item.id === action.itemId ? { ...item, checked: action.checked } : item,
        ),
      };
      return next;
    }
    if (action.type === "decision.select" && block.type === "decision") {
      const allowed = block.options.some((o) => o.id === action.optionId);
      if (!allowed) throw new Error(`Unknown decision option: ${action.optionId}`);
      const next: DecisionBlock = { ...block, selectedId: action.optionId };
      return next;
    }
    throw new Error(`Action ${action.type} not applicable to block ${block.type}`);
  });
}

/**
 * Format interactive Hub block state for the next agent turn's prompt.
 * @param messages - Thread history (newest last or any order)
 * @returns Prompt appendix; empty when no actionable blocks
 */
export function formatBlocksForPrompt(messages: Message[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const blocks = message.blocks;
    if (!blocks?.length) continue;
    for (const block of blocks) {
      if (block.type === "checklist") {
        lines.push(
          `Checklist "${block.title ?? block.id}" (message ${message.id}, block ${block.id}):`,
        );
        for (const item of block.items) {
          lines.push(`  - [${item.checked ? "x" : " "}] ${item.label} (${item.id})`);
        }
      } else if (block.type === "decision") {
        const chosen =
          block.selectedId == null
            ? "(none yet)"
            : (block.options.find((o) => o.id === block.selectedId)?.label ?? block.selectedId);
        lines.push(
          `Decision "${block.prompt}" (message ${message.id}, block ${block.id}): selected=${chosen}`,
        );
      }
    }
  }
  if (lines.length === 0) return "";
  return ["[Hub Actions — operator updates]", ...lines].join("\n");
}

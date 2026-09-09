/**
 * Structured Hub content blocks (M14).
 * Messages may carry `blocks` alongside plain `content` text.
 */

export type ContentBlockType = "text" | "checklist" | "decision" | "diff" | "card";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface DecisionOption {
  id: string;
  label: string;
}

/** Plain text segment (optional; usually message.content holds prose). */
export interface TextBlock {
  type: "text";
  id: string;
  text: string;
}

/** Interactive checklist — Hub toggles write back for later turns. */
export interface ChecklistBlock {
  type: "checklist";
  id: string;
  title?: string;
  items: ChecklistItem[];
}

/** Single-choice decision card. */
export interface DecisionBlock {
  type: "decision";
  id: string;
  prompt: string;
  options: DecisionOption[];
  /** Selected option id after Hub action; null until chosen. */
  selectedId?: string | null;
}

/** Read-only code/diff presentation. */
export interface DiffBlock {
  type: "diff";
  id: string;
  path?: string;
  language?: string;
  before?: string;
  after: string;
}

/** Compact info card. */
export interface CardBlock {
  type: "card";
  id: string;
  title: string;
  body: string;
  tone?: "info" | "warn" | "success";
}

export type ContentBlock =
  | TextBlock
  | ChecklistBlock
  | DecisionBlock
  | DiffBlock
  | CardBlock;

/**
 * Hub → API action payload for mutating interactive blocks.
 */
export type HubBlockAction =
  | {
      type: "checklist.toggle";
      blockId: string;
      itemId: string;
      checked: boolean;
    }
  | {
      type: "decision.select";
      blockId: string;
      optionId: string;
    };

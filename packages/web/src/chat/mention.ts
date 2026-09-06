/**
 * Web-facing mention helpers.
 * Parsing/routing authority lives in `@mac/shared` + API resolveMentionRoute (M07);
 * this module re-exports shared helpers for the composer UX.
 */
export {
  mentionSuggestion,
  parseLeadingMention,
  parseMentions,
  type MentionCat,
  type ParsedMention,
  type ParsedMentions,
} from "@mac/shared";

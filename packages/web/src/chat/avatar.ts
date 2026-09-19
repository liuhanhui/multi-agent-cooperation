/**
 * Warm deterministic avatar colors for the three-cat lounge.
 * Soft teal / sky / coral / honey — matches the light desk theme.
 */

const PALETTE = ["#2f9e8f", "#7eb6d9", "#e8846b", "#f0b35a", "#8bbf9a", "#c98bb8"];

const BREED_COATS: Record<string, string> = {
  architect: "#e2a86a",
  reviewer: "#f7ece0",
  builder: "#aeb9c8",
};

/**
 * Pick a stable color from the author/cat id.
 * Known lounge cats use breed coat colors so portraits and chips stay aligned.
 * @param seed - Cat id or author id
 * @returns CSS color string
 */
export function avatarTone(seed: string): string {
  const breedCoat = BREED_COATS[seed];
  if (breedCoat) return breedCoat;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

/**
 * Build short initials for the avatar disc.
 * @param label - Display name
 * @returns 1–2 uppercase letters
 */
export function avatarInitials(label: string): string {
  const parts = label.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "").slice(0, 1)}${(parts[1] ?? "").slice(0, 1)}`.toUpperCase();
}

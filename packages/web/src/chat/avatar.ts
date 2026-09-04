/** Tiny deterministic avatar from author/cat id — initials only, no external assets. */

const PALETTE = ["#3d9b8f", "#7aa2d4", "#c4a35a", "#b57bb6", "#d97b6c", "#6bbf8a"];

export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

export function avatarInitials(label: string): string {
  const parts = label.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "").slice(0, 1)}${(parts[1] ?? "").slice(0, 1)}`.toUpperCase();
}

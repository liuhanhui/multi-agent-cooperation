import type { CSSProperties } from "react";
import { resolveCatBreed } from "../chat/cat-breed";

interface CatPortraitProps {
  catId: string;
  displayName: string;
  /** Visual size slot used by Lounge chips, bubbles, and Café */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Render a breed-accurate illustrated cat portrait for Lounge identity surfaces.
 * @param props - Registry cat id, display name, optional size and className
 * @returns Circular crop of the public breed image; decorative only, no runtime state
 */
export function CatPortrait({
  catId,
  displayName,
  size = "md",
  className = "",
}: CatPortraitProps) {
  const breed = resolveCatBreed(catId);
  return (
    <span
      className={`cat-portrait size-${size} breed-${breed.breedId} ${className}`.trim()}
      style={{ "--cat-coat": breed.coat } as CSSProperties}
      title={`${displayName} · ${breed.breedLabel}`}
      aria-hidden="true"
    >
      <img
        className="cat-portrait-img"
        src={breed.portraitSrc}
        alt=""
        draggable={false}
      />
    </span>
  );
}

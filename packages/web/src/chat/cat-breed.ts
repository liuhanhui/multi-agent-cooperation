/**
 * Map registry cat ids to distinct breed portraits.
 * Keeps lounge identity stable without inventing a second runtime identity.
 */

export type CatBreedId = "maine-coon" | "siamese" | "british-shorthair";

export interface CatBreedPortrait {
  breedId: CatBreedId;
  breedLabel: string;
  /** Soft coat swatch for chips / fallback discs */
  coat: string;
  /** Secondary points / muzzle / ear tips */
  accent: string;
  /** Eye color swatch */
  eyes: string;
  /** Public illustrated portrait path (breed-accurate, not a second runtime identity) */
  portraitSrc: string;
}

const BREEDS: Record<string, CatBreedPortrait> = {
  architect: {
    breedId: "maine-coon",
    breedLabel: "Maine Coon",
    coat: "#e2a86a",
    accent: "#b87a46",
    eyes: "#7db86a",
    portraitSrc: "/cats/maine-coon.png",
  },
  reviewer: {
    breedId: "siamese",
    breedLabel: "Siamese",
    coat: "#f7ece0",
    accent: "#5c4034",
    eyes: "#4aa3e8",
    portraitSrc: "/cats/siamese.png",
  },
  builder: {
    breedId: "british-shorthair",
    breedLabel: "British Shorthair",
    coat: "#aeb9c8",
    accent: "#7f8b9a",
    eyes: "#d48a2f",
    portraitSrc: "/cats/british-shorthair.png",
  },
};

const FALLBACK: CatBreedPortrait = {
  breedId: "british-shorthair",
  breedLabel: "Domestic Shorthair",
  coat: "#2f9e8f",
  accent: "#1f6f64",
  eyes: "#fff6e8",
  portraitSrc: "/cats/british-shorthair.png",
};

/**
 * Resolve a breed portrait for a registry cat id.
 * @param catId - Stable cat id from the registry / message author
 * @returns Breed colors, label, and illustrated portrait used across Lounge surfaces
 */
export function resolveCatBreed(catId: string): CatBreedPortrait {
  return BREEDS[catId] ?? FALLBACK;
}

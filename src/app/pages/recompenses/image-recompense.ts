const IMAGES_PAR_NIVEAU = ['Bronze', 'Bronze', 'Bronze', 'Argent', 'Or', 'Or1P', 'Or2P'];

export function imageRecompense(niveaux: number[]): string | null {
  const max = Math.max(0, ...niveaux);

  return max > 0 ? `${IMAGES_PAR_NIVEAU[Math.min(max, 7) - 1]}.png` : null;
}

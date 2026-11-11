const IMAGES_PAR_NIVEAU = ['Bronze', 'Bronze', 'Bronze', 'Argent', 'Or', 'Or1P', 'Or2P'];

const LIBELLES: Record<string, string> = {
  Bronze: 'Bronze',
  Argent: 'Argent',
  Or: 'Or',
  Or1P: 'Or + 1P',
  Or2P: 'Or + 2P',
};

export function imageRecompense(niveaux: number[]): string | null {
  const max = Math.max(0, ...niveaux);

  return max > 0 ? `${IMAGES_PAR_NIVEAU[Math.min(max, 7) - 1]}.png` : null;
}

export function niveauMaxRecompense(niveaux: number[]): number {
  return Math.min(Math.max(0, ...niveaux), IMAGES_PAR_NIVEAU.length);
}

export function libelleImageRecompense(image: string, niveau?: number | null): string {
  const libelle = LIBELLES[image.replace('.png', '')] ?? '';

  return libelle && niveau ? `${libelle} [Niv. ${niveau}]` : libelle;
}

import type { RankedPokemon } from './types.ts';

/** HYDRO_CANNON → "Hydro Cannon". */
export function moveLabel(moveId: string): string {
  return moveId
    .toLowerCase()
    .split('_')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Species the user can lock: each ranked species once, by name. */
export function lockOptions(pokemon: RankedPokemon[]): Array<{ speciesId: string; name: string }> {
  const seen = new Map<string, string>();
  for (const p of pokemon)
    if (p.ranked && p.speciesId && !seen.has(p.speciesId)) seen.set(p.speciesId, p.csvName ?? p.species ?? p.speciesId);
  return [...seen].map(([speciesId, name]) => ({ speciesId, name })).sort((a, b) => a.name.localeCompare(b.name));
}

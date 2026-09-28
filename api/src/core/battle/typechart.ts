// Attacking type → defending types it is super effective against / resisted by / (in GO) doubly resisted by.
const CHART: Record<string, { se: string[]; nve: string[]; immune?: string[] }> = {
  normal: { se: [], nve: ['rock', 'steel'], immune: ['ghost'] },
  fire: { se: ['grass', 'ice', 'bug', 'steel'], nve: ['fire', 'water', 'rock', 'dragon'] },
  water: { se: ['fire', 'ground', 'rock'], nve: ['water', 'grass', 'dragon'] },
  electric: { se: ['water', 'flying'], nve: ['electric', 'grass', 'dragon'], immune: ['ground'] },
  grass: { se: ['water', 'ground', 'rock'], nve: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice: { se: ['grass', 'ground', 'flying', 'dragon'], nve: ['fire', 'water', 'ice', 'steel'] },
  fighting: { se: ['normal', 'ice', 'rock', 'dark', 'steel'], nve: ['poison', 'flying', 'psychic', 'bug', 'fairy'], immune: ['ghost'] },
  poison: { se: ['grass', 'fairy'], nve: ['poison', 'ground', 'rock', 'ghost'], immune: ['steel'] },
  ground: { se: ['fire', 'electric', 'poison', 'rock', 'steel'], nve: ['grass', 'bug'], immune: ['flying'] },
  flying: { se: ['grass', 'fighting', 'bug'], nve: ['electric', 'rock', 'steel'] },
  psychic: { se: ['fighting', 'poison'], nve: ['psychic', 'steel'], immune: ['dark'] },
  bug: { se: ['grass', 'psychic', 'dark'], nve: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { se: ['fire', 'ice', 'flying', 'bug'], nve: ['fighting', 'ground', 'steel'] },
  ghost: { se: ['psychic', 'ghost'], nve: ['dark'], immune: ['normal'] },
  dragon: { se: ['dragon'], nve: ['steel'], immune: ['fairy'] },
  dark: { se: ['psychic', 'ghost'], nve: ['fighting', 'dark', 'fairy'] },
  steel: { se: ['ice', 'rock', 'fairy'], nve: ['fire', 'water', 'electric', 'steel'] },
  fairy: { se: ['fighting', 'dragon', 'dark'], nve: ['fire', 'poison', 'steel'] },
};

const SE = 1.6;
const NVE = 0.625;
const IMMUNE = 0.390625; // Pokémon GO has no immunities: they count as double resistance.

export function effectiveness(attackType: string, defenderTypes: string[]): number {
  const row = CHART[attackType];
  if (!row) return 1;
  let m = 1;
  for (const t of defenderTypes) {
    if (row.se.includes(t)) m *= SE;
    else if (row.nve.includes(t)) m *= NVE;
    else if (row.immune?.includes(t)) m *= IMMUNE;
  }
  return m;
}

import fs from 'node:fs';
import path from 'node:path';
import { DATA } from '../paths.ts';
import type { BaseStats } from './cp.ts';

export interface GmPokemon {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: string[];
  baseStats: BaseStats;
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  /** pvpoke tags, e.g. legendary, mythical, ultrabeast, shadoweligible. */
  tags?: string[];
  /** Evolution family: `evolutions` are the next stages. */
  family?: { id: string; parent?: string; evolutions?: string[] };
  /** pvpoke's default IVs per league key ("cp1500", "cp2500"): [level, atk, def, hp]. */
  defaultIVs?: Record<string, [number, number, number, number]>;
}

export interface GmMove {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  /** Duration in 0.5 s turns (fast moves). */
  turns: number;
  buffs?: [number, number];
  buffsSelf?: [number, number];
  buffsOpponent?: [number, number];
  buffTarget?: 'self' | 'opponent' | 'both';
  buffApplyChance?: string;
}

export interface Gamemaster {
  pokemon: GmPokemon[];
  byId: Map<string, GmPokemon>;
  idByName: Map<string, string>;
  statsById: Map<string, BaseStats>;
  moves: Map<string, GmMove>;
}

export function loadGamemaster(file = path.join(DATA, 'gamemaster.json')): Gamemaster {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { pokemon: GmPokemon[]; moves: GmMove[] };
  const pokemon = raw.pokemon;
  return {
    pokemon,
    byId: new Map(pokemon.map(p => [p.speciesId, p])),
    idByName: new Map(pokemon.map(p => [p.speciesName, p.speciesId])),
    statsById: new Map(pokemon.map(p => [p.speciesId, p.baseStats])),
    moves: new Map(raw.moves.map(m => [m.moveId, m])),
  };
}

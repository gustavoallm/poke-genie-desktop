import type { IvRankResult, League } from './ivrank.ts';
import type { RankedPokemon } from './rank.ts';
import type { Ivs } from './types.ts';

// Shared with the front: keep this file free of Node imports.

/** An owned pre-evolution evaluated as a final evolution: IVs and level carry over, CP is recomputed. */
export interface EvolutionEval {
  speciesId: string;
  name: string;
  dex?: number;
  types?: string[];
  /** Key of the virtual row in league rankings (`<source>><speciesId>@<firstTimeSec>`). */
  key: string;
  /** CP right after evolving, at the current level. */
  cpNow: number;
  leagues: Record<League, LeagueEval>;
}

/** One pvpoke overall-rankings entry (rankings-<cap>.json), in ranked order. */
export interface PvpokeEntry {
  speciesId: string;
  score?: number;
  moveset: string[];
}
export type PvpokeRankings = Record<League, PvpokeEntry[]>;

export interface LeagueEval {
  /** CP at or under the league cap (always true for Master). */
  eligible: boolean;
  ranked: boolean;
  unrankedReason?: RankedPokemon['unrankedReason'];
  speciesRank?: number;
  speciesScore?: number;
  recommendedMoves?: RankedPokemon['recommendedMoves'];
  iv50?: IvRankResult;
  iv51?: IvRankResult;
  /** Where this copy stands among the user's eligible copies of the species, by IV rank (1 = best). */
  copy?: { position: number; of: number };
}

export interface InventoryPokemon {
  /** `<source>@<firstTimeSec>`: stable id of one owned Pokémon. */
  key: string;
  source: string;
  firstTimeSec: number;
  speciesId: string | null;
  species: string | null;
  /** Display name (pvpoke species name when known). */
  name: string;
  nickname: string | null;
  cp: number | null;
  level: number | null;
  ivs: Ivs | null;
  hpMax: number | null;
  confidence: 'high' | 'medium' | 'low';
  dex?: number;
  types?: string[];
  moves: { fast: string; charged: string[] } | null;
  formAlternatives?: string[];
  /** The form was set by the user (overrides.json). */
  overridden?: boolean;
  /** Rare species: worth a second thought before transferring. */
  rarity?: 'legendary' | 'mythical' | 'ultrabeast';
  /** This Pokémon as each of its final evolutions (same IVs and level). */
  evolutions?: EvolutionEval[];
  leagues: Record<League, LeagueEval>;
}

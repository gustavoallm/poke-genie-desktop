import type { RankedPokemon } from '../../api/src/core/rank.ts';
import type { League } from '../../api/src/core/ivrank.ts';
import type { Team, TeamCandidate, TeamMember, TeamMeta, TeamsResult, Threat } from '../../api/src/core/teams/generate.ts';
import type { AnalyzeResult, Swap } from '../../api/src/core/teams/analyze.ts';
import type { InventoryPokemon, LeagueEval } from '../../api/src/core/inventory-types.ts';

export type {
  RankedPokemon,
  League,
  TeamsResult,
  Team,
  TeamCandidate,
  TeamMember,
  TeamMeta,
  Threat,
  AnalyzeResult,
  Swap,
  InventoryPokemon,
  LeagueEval,
};

export interface Inventory {
  generatedAt: string;
  sources: string[];
  pokemon: InventoryPokemon[];
}

/** Shape of out/ranked/<league>.json written by `npm run rank` (Infinity caps serialize as null). */
export interface RankedFile {
  league: League;
  cap: number | null;
  generatedAt: string;
  sources: string[];
  csv: string;
  pokemon: RankedPokemon[];
}

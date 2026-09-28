import { loadGamemaster, type Gamemaster } from '../gamemaster.ts';
import { createInventoryStore, type InventoryStore } from '../inventoryStore.ts';
import { LEAGUE_CAPS, type League } from '../ivrank.ts';
import type { Combatant } from '../battle/combatant.ts';
import { buildCandidates, loadMeta, matrixRow } from './build.ts';
import { DEFAULT_STYLE, generateTeams, type Matrix, type TeamMeta, type TeamsResult } from './generate.ts';
import { analyzeTeam, type AnalyzeResult } from './analyze.ts';

/** An error the API reports to the caller with its HTTP status (bad input, missing data). */
export class TeamsError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type { TeamsResult, AnalyzeResult };

export interface TeamService {
  generate(league: League, locks: string[], style?: number, ignoreIvs?: boolean): Promise<unknown>;
  analyze(league: League, members: string[], style?: number, ignoreIvs?: boolean): Promise<unknown>;
}

export const MAX_LOCKS = 2;

/**
 * Builds teams from the inventory's league ranking. The meta and every candidate's matchup row are cached,
 * so regenerating with different locks or styles only simulates candidates that were not seen before.
 */
export function createTeamService({
  store = createInventoryStore(),
  metaSize = 50,
  candidateCount = 60,
  gm,
}: { store?: InventoryStore; metaSize?: number; candidateCount?: number; gm?: Gamemaster } = {}) {
  let gamemaster = gm;
  const metaCache = new Map<number, { meta: TeamMeta[]; combatants: Combatant[] }>();
  const rowCache = new Map<string, number[][]>();

  function matrixFor(league: League, opts: { locks?: string[]; include?: string[]; ignoreIvs?: boolean }): Matrix {
    const cap = LEAGUE_CAPS[league];
    if (!Number.isFinite(cap)) throw new TeamsError('Master League teams are not supported yet.');
    const rankedLeague = store.ranked(league);
    if (!rankedLeague) throw new TeamsError(`No ranked Pokémon for league "${league}" yet.`, 404);
    gamemaster ??= loadGamemaster();
    const ranked = rankedLeague.pokemon;
    let metaEntry = metaCache.get(cap);
    if (!metaEntry) {
      metaEntry = loadMeta(gamemaster, cap, metaSize);
      metaCache.set(cap, metaEntry);
    }
    const { candidates, combatants } = buildCandidates(gamemaster, ranked, cap, { top: candidateCount, ...opts });
    const ratings = candidates.map((c, i) => {
      const key = `${cap}|${c.key}|${c.speciesId}|${c.level}|${c.moves.join(',')}`;
      let row = rowCache.get(key);
      if (!row) {
        row = matrixRow(combatants[i], metaEntry!.combatants);
        rowCache.set(key, row);
      }
      return row;
    });
    return { candidates, meta: metaEntry.meta, ratings };
  }

  return {
    async generate(league: League, locks: string[] = [], style = DEFAULT_STYLE, ignoreIvs = false): Promise<TeamsResult> {
      if (locks.length > MAX_LOCKS) throw new TeamsError(`At most ${MAX_LOCKS} locked Pokémon.`);
      const m = matrixFor(league, { locks, ignoreIvs });
      const missing = locks.filter(id => !m.candidates.some(c => c.speciesId === id));
      if (missing.length) throw new TeamsError(`Locked Pokémon not among your ranked ${league} Pokémon: ${missing.join(', ')}`);
      const teams = generateTeams(m, { locks, style, top: 10 });
      return {
        league,
        cap: LEAGUE_CAPS[league],
        generatedAt: new Date().toISOString(),
        locks,
        style,
        ignoreIvs,
        candidates: m.candidates.length,
        meta: m.meta,
        teams,
      };
    },

    /** members = candidate keys (`<source>@<firstTimeSec>`) of 3 specific owned Pokémon. */
    async analyze(league: League, members: string[], style = DEFAULT_STYLE, ignoreIvs = false): Promise<AnalyzeResult> {
      if (members.length !== 3 || new Set(members).size !== 3) throw new TeamsError('Pick 3 different Pokémon.');
      const m = matrixFor(league, { include: members, ignoreIvs });
      const idx = members.map(key => m.candidates.findIndex(c => c.key === key));
      if (idx.some(i => i < 0))
        throw new TeamsError('Some picked Pokémon are not ranked for this league (missing species, IVs or ranking).');
      if (new Set(idx.map(i => m.candidates[i].dex)).size < 3) throw new TeamsError('A team needs 3 different species.');
      return { league, style, ignoreIvs, meta: m.meta, ...analyzeTeam(m, idx, style) };
    },
  };
}

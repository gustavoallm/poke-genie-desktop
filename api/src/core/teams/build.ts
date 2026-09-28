import type { Gamemaster } from '../gamemaster.ts';
import type { RankedPokemon } from '../rank.ts';
import { buildCombatant, type Combatant } from '../battle/combatant.ts';
import { cpOf, LEVELS } from '../cp.ts';
import { simulate } from '../battle/battle.ts';
import { loadPvpokeRankings, metaCombatant } from '../battle/pvpoke-check.ts';
import type { TeamCandidate, TeamMeta } from './generate.ts';

export const SCENARIOS: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [2, 2],
];

/** The league meta as pvpoke simulates it: overall top N, pvpoke's movesets, default IVs, weighted by score. */
export function loadMeta(gm: Gamemaster, cap: number, top = 50): { meta: TeamMeta[]; combatants: Combatant[] } {
  const meta: TeamMeta[] = [];
  const combatants: Combatant[] = [];
  for (const entry of loadPvpokeRankings('overall', cap)) {
    if (meta.length === top) break;
    const c = metaCombatant(gm, entry, cap);
    if (!c) continue;
    const species = gm.byId.get(entry.speciesId);
    meta.push({ speciesId: entry.speciesId, name: species?.speciesName ?? entry.speciesId, weight: entry.score ?? 1, dex: species?.dex });
    combatants.push(c);
  }
  return { meta, combatants };
}

/** Identifies one owned Pokémon across requests (the video it came from and when it appeared). */
export const candidateKey = (p: Pick<RankedPokemon, 'source' | 'firstTimeSec'>) => `${p.source}@${p.firstTimeSec}`;

/** Extracted move names ("Hydro Pump") → move ids; null if any name is unknown. */
export function movesFromNames(gm: Gamemaster, moves: { fast: string; charged: string[] }): string[] | null {
  const byName = new Map([...gm.moves.values()].map(m => [m.name.toLowerCase(), m.moveId]));
  const ids = [moves.fast, ...moves.charged].map(n => byName.get(n.toLowerCase()));
  return ids.every(Boolean) && ids.length >= 2 ? (ids as string[]) : null;
}

/**
 * The user's team candidates: best IV copy per ranked species, top N by pvpoke score plus locked species,
 * simulated at the highest level under the cap with their real moves or pvpoke's recommended moveset.
 */
export function buildCandidates(
  gm: Gamemaster,
  ranked: RankedPokemon[],
  cap: number,
  { top = 60, locks = [] as string[], include = [] as string[], ignoreIvs = false } = {},
): { candidates: TeamCandidate[]; combatants: Combatant[] } {
  const pvpokeMoveset = new Map(loadPvpokeRankings('overall', cap).map(e => [e.speciesId, e.moveset]));
  const best = new Map<string, RankedPokemon>();
  for (const p of ranked) {
    if (!p.ranked || !p.speciesId || !p.ivs || !p.iv50) continue;
    const current = best.get(p.speciesId);
    if (!current || p.iv50.rank < current.iv50!.rank) best.set(p.speciesId, p);
  }
  // Specific copies to analyse replace the best copy of their species.
  for (const key of include) {
    const p = ranked.find(r => candidateKey(r) === key);
    if (p?.ranked && p.speciesId && p.ivs && p.iv50) best.set(p.speciesId, p);
  }
  const sorted = [...best.values()].sort((a, b) => (b.speciesScore ?? 0) - (a.speciesScore ?? 0));
  const forced = (p: RankedPokemon) => locks.includes(p.speciesId!) || include.includes(candidateKey(p));
  const chosen = [...sorted.slice(0, top), ...sorted.slice(top).filter(forced)];

  const candidates: TeamCandidate[] = [];
  const combatants: Combatant[] = [];
  for (const p of chosen) {
    const speciesId = p.speciesId!;
    const real = p.moves ? movesFromNames(gm, p.moves) : null;
    const moves = real ?? pvpokeMoveset.get(speciesId);
    if (!moves) continue;
    const elite = gm.byId.get(speciesId)?.eliteMoves ?? [];
    // Ignore-IVs mode: judge the species as pvpoke does (its default IVs and level for the league).
    const defaults = ignoreIvs ? gm.byId.get(speciesId)?.defaultIVs?.[`cp${cap}`] : undefined;
    const ivs = defaults ? { atk: defaults[1], def: defaults[2], hp: defaults[3] } : p.ivs!;
    const level = defaults ? defaults[0] : p.iv50!.level;
    const cpm = LEVELS.find(l => l.level === level)!.cpm;
    candidates.push({
      key: candidateKey(p),
      speciesId,
      name: p.csvName ?? p.species ?? speciesId,
      dex: p.dex ?? 0,
      pvpokeScore: p.speciesScore,
      nickname: p.nickname,
      cp: defaults ? cpOf(gm.statsById.get(speciesId)!, ivs, cpm) : p.cp,
      ivs,
      level,
      currentLevel: defaults ? null : p.level,
      moves,
      assumedMoves: !real,
      assumedElite: real ? [] : moves.filter(m => elite.includes(m)),
      ...(defaults ? { ivsIgnored: true } : {}),
      ...(p.evolvesFrom ? { evolvesFrom: p.evolvesFrom } : {}),
    });
    combatants.push(buildCombatant(gm, speciesId, ivs, level, moves));
  }
  return { candidates, combatants };
}

/** One candidate's ratings vs every meta mon in each shield scenario. */
export function matrixRow(candidate: Combatant, meta: Combatant[]): number[][] {
  return meta.map(opp => SCENARIOS.map(s => simulate(candidate, opp, s).rating));
}

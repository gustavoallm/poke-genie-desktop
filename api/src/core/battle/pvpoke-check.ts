import fs from 'node:fs';
import path from 'node:path';
import { DATA } from '../../paths.ts';
import type { Gamemaster } from '../gamemaster.ts';
import { buildCombatant, type Combatant } from './combatant.ts';
import { simulate } from './battle.ts';

export interface PvpokeRankingEntry {
  speciesId: string;
  score?: number;
  moveset: string[];
  matchups: Array<{ opponent: string; rating: number }>;
  counters: Array<{ opponent: string; rating: number }>;
}

export function loadPvpokeRankings(category: 'overall' | 'leads' | 'closers', cap: number): PvpokeRankingEntry[] {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'pvpoke', `${category}-${cap}.json`), 'utf8'));
}

/** A meta Pokémon as pvpoke simulates it: its ranking moveset and the gamemaster's default IVs for the league. */
export function metaCombatant(gm: Gamemaster, entry: PvpokeRankingEntry, cap: number): Combatant | null {
  const iv = gm.byId.get(entry.speciesId)?.defaultIVs?.[`cp${cap}`];
  if (!iv) return null;
  return buildCombatant(gm, entry.speciesId, { atk: iv[1], def: iv[2], hp: iv[3] }, iv[0], entry.moveset);
}

export interface AgreementCase {
  species: string;
  opponent: string;
  pvpoke: number;
  ours: number;
  agree: boolean;
}

/**
 * Re-simulates the matchups/counters pvpoke lists for its top species (leads = 1-1 shields) and reports
 * how often our winner matches pvpoke's (rating > 500 = win).
 */
export function pvpokeAgreement(gm: Gamemaster, cap: number, top = 100, shields: [number, number] = [1, 1]) {
  const ranking = loadPvpokeRankings(shields[0] === 0 ? 'closers' : 'leads', cap);
  const byId = new Map(ranking.map(e => [e.speciesId, e]));
  const cases: AgreementCase[] = [];
  for (const entry of ranking.slice(0, top)) {
    const me = metaCombatant(gm, entry, cap);
    if (!me) continue;
    for (const m of [...entry.matchups, ...entry.counters]) {
      const oppEntry = byId.get(m.opponent);
      const opp = oppEntry && metaCombatant(gm, oppEntry, cap);
      if (!opp || m.rating === 500) continue;
      const ours = simulate(me, opp, shields).rating;
      cases.push({ species: entry.speciesId, opponent: m.opponent, pvpoke: m.rating, ours, agree: ours > 500 === m.rating > 500 });
    }
  }
  return { agreement: cases.filter(c => c.agree).length / cases.length, cases };
}

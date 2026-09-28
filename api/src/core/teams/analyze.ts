import {
  rankTeams,
  threatsFor,
  toTeam,
  type Matrix,
  type Role,
  type Team,
  type TeamCandidate,
  type TeamMeta,
  type RankedTeam,
} from './generate.ts';
import type { League } from '../ivrank.ts';

export interface Swap {
  slot: Role;
  from: TeamCandidate;
  to: TeamCandidate;
  /** Rating change (0-100 scale) if the swap is made. */
  delta: number;
  /** Threats the team currently loses to that the swapped team no longer does. */
  fixes: string[];
}

export interface TeamReport {
  team: Team;
  /** 1 = the best team possible from the box under the same scoring. */
  rank: number;
  totalTeams: number;
  /** The slot whose best replacement gains most; null if nothing improves the team. */
  weakestSlot: Role | null;
  swaps: Swap[];
}

/** What POST /api/teams/analyze returns. */
export interface AnalyzeResult extends TeamReport {
  league: League;
  style: number;
  ignoreIvs: boolean;
  meta: TeamMeta[];
}

const SWAPS_SHOWN = 3;
const keyOf = (members: number[]) => [...members].sort((a, b) => a - b).join(',');

export function analyzeTeam(m: Matrix, members: number[], style: number): TeamReport {
  const ranked = rankTeams(m, { style });
  const byMembers = new Map<string, { entry: RankedTeam; position: number }>();
  ranked.forEach((entry, position) => byMembers.set(keyOf(entry.evaluation.members), { entry, position }));

  const own = byMembers.get(keyOf(members));
  if (!own) throw new Error('Team is not valid (members must be 3 different species).');
  const team = toTeam(m, own.entry);
  const order = own.entry.evaluation.members; // role order
  const losing = new Set(team.threats.filter(t => t.coverage < 500).map(t => t.speciesId));

  const swaps: Swap[] = [];
  order.forEach((from, slot) => {
    const others = order.filter(c => c !== from);
    const otherDex = new Set(others.map(c => m.candidates[c].dex));
    let best: { to: number; entry: RankedTeam } | null = null;
    m.candidates.forEach((cand, to) => {
      if (order.includes(to) || otherDex.has(cand.dex)) return;
      const found = byMembers.get(keyOf([...others, to]));
      if (found && (!best || found.entry.rating > best.entry.rating)) best = { to, entry: found.entry };
    });
    const b = best as { to: number; entry: RankedTeam } | null;
    if (!b || b.entry.rating <= own.entry.rating) return;
    const stillLosing = new Set(
      threatsFor(m, b.entry.evaluation.members)
        .filter(t => t.coverage < 500)
        .map(t => t.speciesId),
    );
    swaps.push({
      slot: team.members[slot].role,
      from: m.candidates[from],
      to: m.candidates[b.to],
      delta: b.entry.rating - own.entry.rating,
      fixes: team.threats.filter(t => losing.has(t.speciesId) && !stillLosing.has(t.speciesId)).map(t => t.name),
    });
  });
  swaps.sort((a, b) => b.delta - a.delta);

  return {
    team,
    rank: own.position + 1,
    totalTeams: ranked.length,
    weakestSlot: swaps[0]?.slot ?? null,
    swaps: swaps.slice(0, SWAPS_SHOWN),
  };
}

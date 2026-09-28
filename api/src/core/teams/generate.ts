import type { Ivs } from '../types.ts';
import type { League } from '../ivrank.ts';

export interface TeamCandidate {
  /** Unique per owned Pokémon (source + first frame time). */
  key: string;
  speciesId: string;
  name: string;
  dex: number;
  /** pvpoke's overall score for the species in this league (0-100): proven strength. */
  pvpokeScore?: number;
  nickname?: string | null;
  cp?: number | null;
  ivs?: Ivs | null;
  /** Level it is simulated at: the highest level under the league cap. */
  level?: number;
  /** Level it is at now (from the video), to show the power-up needed. */
  currentLevel?: number | null;
  /** [fast, charged, charged?] move ids. */
  moves: string[];
  /** true = moves not extracted from video, pvpoke's recommended moveset assumed. */
  assumedMoves: boolean;
  /** Elite/legacy move ids in an assumed moveset (need an Elite TM if the mon doesn't know them). */
  assumedElite: string[];
  /** Simulated with pvpoke's default IVs and level for the league (ignore-IVs mode), not this copy's. */
  ivsIgnored?: boolean;
  /** An owned pre-evolution that would become this candidate once evolved. */
  evolvesFrom?: { key: string; name: string };
}

export interface TeamMeta {
  speciesId: string;
  name: string;
  weight: number;
  dex?: number;
}

/** ratings[candidate][meta][scenario], scenario 0 = 0-0 shields, 1 = 1-1, 2 = 2-2. */
export interface Matrix {
  candidates: TeamCandidate[];
  meta: TeamMeta[];
  ratings: number[][][];
}

export type Role = 'lead' | 'safe swap' | 'closer';
export interface TeamMember {
  role: Role;
  candidate: TeamCandidate;
  /** Role-weighted average rating vs the meta. */ rating: number;
}
export interface Threat {
  speciesId: string;
  name: string;
  dex?: number;
  coverage: number;
  losers: string[];
}
export interface Team {
  members: TeamMember[];
  /** 0-100 blend of coverage and proven strength, relative to the other teams evaluated. */
  rating: number;
  /** Role-aware matchup coverage (≈ battle rating scale, 500 = even). */
  coverage: number;
  /** Mean pvpoke score of the members. */
  strength: number;
  /** Share of the (weighted) meta that at least one member beats. */
  beaten: number;
  threats: Threat[];
  /** matchups[member][meta][scenario] ratings, members in role order — for the heatmap. */
  matchups: number[][][];
}

/** What POST /api/teams and `npm run teams` return. */
export interface TeamsResult {
  league: League;
  cap: number;
  generatedAt: string;
  locks: string[];
  style: number;
  /** Species simulated with pvpoke's default IVs instead of the user's copies. */
  ignoreIvs: boolean;
  candidates: number;
  meta: TeamMeta[];
  teams: Team[];
}

/** Scenario weights [0-0, 1-1, 2-2]: leads play mostly even shields, closers mostly without shields. */
export const ROLE_WEIGHTS: Record<Role, [number, number, number]> = {
  lead: [0.2, 0.6, 0.2],
  'safe swap': [1 / 3, 1 / 3, 1 / 3],
  closer: [0.6, 0.3, 0.1],
};
const ROLES: Role[] = ['lead', 'safe swap', 'closer'];
const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const SHARED_LOSS_PENALTY = 150;
const THREATS_SHOWN = 5;
/** 0 = consistent (proven species weigh most), 1 = spice (raw matchup coverage only). */
export const DEFAULT_STYLE = 0.2; // calibrated 2026-09-27: leans consistent (see spec)
const MAX_STRENGTH_WEIGHT = 0.6;

export function roleRating(m: Matrix, c: number, t: number, role: Role): number {
  const w = ROLE_WEIGHTS[role];
  const r = m.ratings[c][t];
  return w[0] * r[0] + w[1] * r[1] + w[2] * r[2];
}

export interface Evaluation {
  /** Candidate indices in role order: lead, safe swap, closer. */
  members: number[];
  coverage: number;
  /** Average of all members' role ratings: tie-breaker between role orders with equal coverage. */
  depth: number;
  strength: number;
  beaten: number;
}

export interface EvaluationWithThreats extends Evaluation {
  threats: Threat[];
}

/** Weakest-answered threats of a team whose members are already in role order. */
export function threatsFor(m: Matrix, ordered: number[]): Threat[] {
  const threats = m.meta.map((t, i) => {
    const ratings = ordered.map((c, k) => roleRating(m, c, i, ROLES[k]));
    const losers = ordered.filter((_, k) => ratings[k] < 500);
    return {
      speciesId: t.speciesId,
      name: t.name,
      dex: t.dex,
      coverage: Math.round(Math.max(...ratings)),
      losers: losers.map(c => m.candidates[c].key),
    };
  });
  threats.sort((a, b) => a.coverage - b.coverage || b.losers.length - a.losers.length);
  return threats.slice(0, THREATS_SHOWN);
}

/** Per candidate, per role, per threat: the role-weighted rating (computed once per matrix). */
function roleTable(m: Matrix, candidates: number[]): Map<number, number[][]> {
  return new Map(candidates.map(c => [c, ROLES.map(role => m.meta.map((_, t) => roleRating(m, c, t, role)))]));
}

function scoreOrder(m: Matrix, table: Map<number, number[][]>, ordered: number[]) {
  const [a, b, c] = ordered.map((x, k) => table.get(x)![k]);
  let total = 0,
    weight = 0,
    covered = 0,
    depth = 0;
  m.meta.forEach((t, i) => {
    const ra = a[i],
      rb = b[i],
      rc = c[i];
    const best = Math.max(ra, rb, rc);
    const losers = Number(ra < 500) + Number(rb < 500) + Number(rc < 500);
    total += t.weight * (best - SHARED_LOSS_PENALTY * Math.max(0, losers - 1));
    depth += (t.weight * (ra + rb + rc)) / 3;
    weight += t.weight;
    if (best > 500) covered += t.weight;
  });
  return { members: ordered, coverage: total / weight, depth: depth / weight, beaten: covered / weight };
}

function bestOrder(m: Matrix, table: Map<number, number[][]>, members: number[]): Evaluation {
  let best: Omit<Evaluation, 'strength'> | null = null;
  for (const p of PERMUTATIONS) {
    const e = scoreOrder(
      m,
      table,
      p.map(i => members[i]),
    );
    if (!best || e.coverage > best.coverage || (e.coverage === best.coverage && e.depth > best.depth)) best = e;
  }
  const strength = members.reduce((s, c) => s + (m.candidates[c].pvpokeScore ?? 0), 0) / members.length;
  return { ...best!, strength };
}

/**
 * Scores a 3-mon team: for each meta threat (weighted by its pvpoke score) the best role-weighted answer,
 * minus a penalty for every extra member that loses to it. Roles are the best of the 6 orders.
 */
export function evaluateTeam(m: Matrix, members: number[]): EvaluationWithThreats {
  const e = bestOrder(m, roleTable(m, members), members);
  return { ...e, threats: threatsFor(m, e.members) };
}

export interface RankedTeam {
  evaluation: Evaluation;
  rating: number;
}

/**
 * Every 3-mon team (distinct dex, containing all locks) rated 0-100: coverage and strength are min-max
 * normalised over the evaluated teams and blended by style.
 */
export function rankTeams(m: Matrix, { locks = [], style = DEFAULT_STYLE }: { locks?: string[]; style?: number } = {}): RankedTeam[] {
  const n = m.candidates.length;
  const lockedIdx = locks.map(id => m.candidates.findIndex(c => c.speciesId === id || c.key === id));
  if (lockedIdx.some(i => i < 0) || lockedIdx.length > 3) return [];
  const table = roleTable(
    m,
    m.candidates.map((_, i) => i),
  );
  const evaluations: Evaluation[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const members = [a, b, c];
        if (!lockedIdx.every(i => members.includes(i))) continue;
        if (new Set(members.map(i => m.candidates[i].dex)).size < 3) continue;
        evaluations.push(bestOrder(m, table, members));
      }
  const range = (xs: number[]) => {
    const lo = Math.min(...xs),
      hi = Math.max(...xs);
    return (x: number) => (hi > lo ? (x - lo) / (hi - lo) : 1);
  };
  const covN = range(evaluations.map(e => e.coverage));
  const strN = range(evaluations.map(e => e.strength));
  const k = MAX_STRENGTH_WEIGHT * (1 - Math.max(0, Math.min(1, style)));
  return evaluations
    .map(e => ({ evaluation: e, rating: Math.round(100 * ((1 - k) * covN(e.coverage) + k * strN(e.strength))) }))
    .sort((x, y) => y.rating - x.rating || y.evaluation.coverage - x.evaluation.coverage);
}

/** Turns a ranked team into the API shape, with members' role ratings and the heatmap matchups. */
export function toTeam(m: Matrix, { evaluation: e, rating }: RankedTeam): Team {
  const weightSum = m.meta.reduce((s, t) => s + t.weight, 0);
  const members = e.members.map((c, k) => ({
    role: ROLES[k],
    candidate: m.candidates[c],
    rating: Math.round(m.meta.reduce((s, t, i) => s + t.weight * roleRating(m, c, i, ROLES[k]), 0) / weightSum),
  }));
  return {
    members,
    rating,
    coverage: Math.round(e.coverage),
    strength: Math.round(e.strength * 10) / 10,
    beaten: e.beaten,
    threats: threatsFor(m, e.members),
    matchups: e.members.map(c => m.ratings[c]),
  };
}

export function generateTeams(
  m: Matrix,
  { locks = [], top = 10, style = DEFAULT_STYLE }: { locks?: string[]; top?: number; style?: number } = {},
): Team[] {
  return rankTeams(m, { locks, style })
    .slice(0, top)
    .map(r => toTeam(m, r));
}

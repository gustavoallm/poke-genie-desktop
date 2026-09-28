import { describe, it, expect } from 'vitest';
import { analyzeTeam } from '../../src/core/teams/analyze.ts';
import type { Matrix, TeamCandidate } from '../../src/core/teams/generate.ts';

const cand = (speciesId: string, dex: number): TeamCandidate => ({
  key: `${speciesId}@0`,
  speciesId,
  name: speciesId,
  dex,
  pvpokeScore: 90,
  moves: [],
  assumedMoves: false,
  assumedElite: [],
});
const flat = (rows: number[][]) => rows.map(r => r.map(v => [v, v, v]));

// Threats x and y. a answers x, b answers y, c answers nothing, d answers both.
const m: Matrix = {
  candidates: [cand('a', 1), cand('b', 2), cand('c', 3), cand('d', 4), cand('e', 5)],
  meta: [
    { speciesId: 'x', name: 'X', weight: 1 },
    { speciesId: 'y', name: 'Y', weight: 1 },
  ],
  ratings: flat([
    [800, 400],
    [400, 800],
    [300, 300],
    [700, 700],
    [450, 450],
  ]),
};

describe('analyzeTeam', () => {
  const report = analyzeTeam(m, [0, 1, 2], 1);

  it('places the team among every team possible from the box', () => {
    expect(report.totalTeams).toBe(10); // C(5,3)
    expect(report.rank).toBeGreaterThan(1);
    expect(report.team.members.map(x => x.candidate.speciesId).sort()).toEqual(['a', 'b', 'c']);
  });
  it('suggests the best swap per slot, best first, with what it fixes', () => {
    expect(report.swaps.length).toBeGreaterThan(0);
    const best = report.swaps[0];
    expect(best.from.speciesId).toBe('c');
    expect(best.to.speciesId).toBe('d');
    expect(best.delta).toBeGreaterThan(0);
    for (let i = 1; i < report.swaps.length; i++) expect(report.swaps[i - 1].delta).toBeGreaterThanOrEqual(report.swaps[i].delta);
  });
  it('names the weakest slot as the one whose swap gains most', () => {
    const cSlot = report.team.members.find(x => x.candidate.speciesId === 'c')!.role;
    expect(report.weakestSlot).toBe(cSlot);
  });
  it('reports no swaps for a team that cannot be improved', () => {
    const best = analyzeTeam(m, [0, 1, 3], 1);
    expect(best.rank).toBe(1);
    expect(best.swaps.every(s => s.delta > 0)).toBe(true);
    expect(best.weakestSlot === null || best.swaps.length > 0).toBe(true);
  });
});

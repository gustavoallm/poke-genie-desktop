import { describe, it, expect } from 'vitest';
import { evaluateTeam, generateTeams, roleRating, type Matrix, type TeamCandidate } from '../../src/core/teams/generate.ts';

const cand = (speciesId: string, dex: number, pvpokeScore = 90): TeamCandidate => ({
  key: speciesId,
  speciesId,
  name: speciesId,
  dex,
  pvpokeScore,
  moves: [],
  assumedMoves: false,
  assumedElite: [],
});
/** One value per meta mon (used for all scenarios) or a triple [0-0, 1-1, 2-2]. */
const matrix = (cands: TeamCandidate[], metaIds: string[], rows: Array<Array<number | [number, number, number]>>): Matrix => ({
  candidates: cands,
  meta: metaIds.map(id => ({ speciesId: id, name: id, weight: 1 })),
  ratings: rows.map(r => r.map(v => (Array.isArray(v) ? v : [v, v, v]))),
});

describe('roleRating', () => {
  it('weights shield scenarios by role: lead leans on 1-1, closer on 0-0', () => {
    const m = matrix([cand('a', 1)], ['x'], [[[0, 1000, 0]]]);
    expect(roleRating(m, 0, 0, 'lead')).toBeCloseTo(600);
    expect(roleRating(m, 0, 0, 'closer')).toBeCloseTo(300);
    expect(roleRating(m, 0, 0, 'safe swap')).toBeCloseTo(1000 / 3);
  });
});

describe('evaluateTeam', () => {
  it('picks the role order that covers the meta best', () => {
    // a shines at 1-1 (lead), b at 0-0 (closer), c is flat.
    const m = matrix([cand('a', 1), cand('b', 2), cand('c', 3)], ['x'], [[[300, 900, 300]], [[900, 300, 300]], [500]]);
    const t = evaluateTeam(m, [2, 1, 0]);
    expect(t.members.map(i => m.candidates[i].speciesId)).toEqual(['a', 'c', 'b']); // lead, safe swap, closer
  });
  it('penalises members losing to the same threat and reports what the team beats', () => {
    const m = matrix(
      [cand('a', 1), cand('b', 2), cand('c', 3), cand('d', 4)],
      ['x', 'y'],
      [
        [900, 900],
        [300, 600],
        [300, 600],
        [600, 300],
      ],
    );
    const shared = evaluateTeam(m, [0, 1, 2]);
    const spread = evaluateTeam(m, [0, 1, 3]);
    expect(shared.coverage).toBeLessThan(spread.coverage);
    expect(shared.beaten).toBe(1);
    expect(shared.threats.find(t => t.speciesId === 'x')!.losers.sort()).toEqual(['b', 'c']);
  });
});

describe('generateTeams', () => {
  // t1 = a,b,c: slightly better coverage, weaker species. t2 = d,e,f: slightly worse coverage, proven species.
  const cands = [cand('a', 1, 80), cand('b', 2, 80), cand('c', 3, 80), cand('d', 4, 95), cand('e', 5, 95), cand('f', 6, 95)];
  const m = matrix(
    cands,
    ['x', 'y'],
    [
      [700, 300],
      [300, 700],
      [650, 650],
      [640, 300],
      [300, 640],
      [600, 600],
    ],
  );
  const teamIds = (style: number) =>
    generateTeams(m, { style, top: 50 }).map(t =>
      t.members
        .map(x => x.candidate.speciesId)
        .sort()
        .join(''),
    );

  it('favours proven species when style is consistent, raw coverage when it is spice', () => {
    expect(teamIds(0).indexOf('def')).toBeLessThan(teamIds(0).indexOf('abc'));
    expect(teamIds(1).indexOf('abc')).toBeLessThan(teamIds(1).indexOf('def'));
  });
  it('rates teams 0-100, best first, with member-by-meta matchups for the heatmap', () => {
    const teams = generateTeams(m, { style: 0.5, top: 5 });
    expect(teams[0].rating).toBeGreaterThanOrEqual(teams[1].rating);
    for (const t of teams) {
      expect(t.rating).toBeGreaterThanOrEqual(0);
      expect(t.rating).toBeLessThanOrEqual(100);
    }
    expect(teams[0].matchups).toHaveLength(3);
    expect(teams[0].matchups[0]).toHaveLength(2);
    expect(teams[0].matchups[0][0]).toHaveLength(3);
  });
  it('keeps locks and never repeats a species', () => {
    const withDup = matrix([...cands, cand('d_shadow', 4, 95)], ['x', 'y'], [...m.ratings.map(r => r.map(s => s[1])), [900, 900]]);
    for (const t of generateTeams(withDup, { locks: ['a'], top: 20 })) {
      const ids = t.members.map(x => x.candidate.speciesId);
      expect(ids).toContain('a');
      expect(new Set(t.members.map(x => x.candidate.dex)).size).toBe(3);
    }
  });
});

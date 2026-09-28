import { describe, it, expect } from 'vitest';
import { rankCollection, type ExtractedMon } from '../../src/core/rank.ts';
import type { SpeciesRanking } from '../../src/core/rankings.ts';
import { loadGamemaster } from '../../src/core/gamemaster.ts';

const gm = loadGamemaster();
const ranking = (speciesId: string, rank: number, score: number): SpeciesRanking => ({
  rank,
  score,
  csvName: speciesId,
  speciesId,
  dex: 1,
  types: ['water'],
  moves: { fast: 'A', charged: ['B', 'C'] },
});
const rankings = new Map([
  ['empoleon', ranking('empoleon', 8, 92.1)],
  ['lapras', ranking('lapras', 22, 90.5)],
]);
const mon = (p: Partial<ExtractedMon>): ExtractedMon => ({
  cp: 2000,
  species: null,
  nickname: null,
  ivs: { atk: 10, def: 10, hp: 10 },
  hp: { current: 150, max: 150 },
  confidence: 'high',
  firstTimeSec: 0,
  ...p,
});

describe('rankCollection', () => {
  const out = rankCollection(
    [
      {
        source: 'v.mp4',
        pokemon: [
          mon({ speciesId: 'lapras', species: 'Lapras', cp: 1967 }),
          mon({ speciesId: 'empoleon', species: 'Empoleon', cp: 2496, ivs: { atk: 15, def: 15, hp: 15 } }),
          mon({ speciesId: 'empoleon', species: 'Empoleon', cp: 2400, ivs: { atk: 0, def: 15, hp: 15 } }),
          mon({ speciesId: 'roselia', species: 'Roselia', cp: 1590 }),
          mon({ species: 'Mewtwo', cp: 1761 }),
          mon({ speciesId: 'lapras', species: 'Lapras', cp: 2600 }),
        ],
      },
    ],
    'ultra',
    rankings,
    gm.statsById,
  );

  it('orders by species score, then IV rank, with unranked last and over-cap excluded', () => {
    expect(out.map(p => [p.speciesId, p.ivs?.atk])).toEqual([
      ['empoleon', 0],
      ['empoleon', 15],
      ['lapras', 10],
      [null, 10],
      ['roselia', 10],
    ]);
  });
  it('fills league fields and IV ranks at level 50 and 51', () => {
    expect(out[0]).toMatchObject({ ranked: true, speciesRank: 8, speciesScore: 92.1, source: 'v.mp4' });
    expect(out[0].iv50!.rank).toBeLessThan(out[1].iv50!.rank);
    expect(out[0].iv51!.level).toBeGreaterThan(0);
  });
  it('explains why a mon is unranked', () => {
    expect(out.find(p => p.speciesId === 'roselia')).toMatchObject({ ranked: false, unrankedReason: 'not-in-rankings' });
    expect(out.find(p => p.species === 'Mewtwo')).toMatchObject({ ranked: false, unrankedReason: 'no-species' });
  });
});

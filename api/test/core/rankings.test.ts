import { describe, it, expect } from 'vitest';
import { parseRankingsCsv } from '../../src/core/rankings.ts';

const CSV = `Pokemon,Score,Dex,Type 1,Type 2,Attack,Defense,Stamina,Stat Product,Level,CP,Fast Move,Charged Move 1,Charged Move 2,Charged Move 1 Count,Charged Move 2 Count,Buddy Distance,Charged Move Cost
Tinkaton,94.4,959,fairy,steel,140.3,177.3,178,4428816,50,2499,Fairy Wind,Gigaton Hammer*,Bulldoze,7,7,3,75000
Snorlax (Shadow),93.7,143,normal,none,139.1,131.2,245,4470989,28.5,2495,Psywave,Body Slam,Earthquake,10,17,5,75000
Unknownmon,50,999,normal,none,1,1,1,1,1,10,Tackle,Struggle,Struggle,1,1,1,1
`;
const ids = new Map([
  ['Tinkaton', 'tinkaton'],
  ['Snorlax (Shadow)', 'snorlax_shadow'],
]);

describe('parseRankingsCsv', () => {
  const r = parseRankingsCsv(CSV, ids);
  it('keeps the CSV order as rank and parses fields', () => {
    expect(r.get('tinkaton')).toEqual({
      rank: 1,
      score: 94.4,
      csvName: 'Tinkaton',
      speciesId: 'tinkaton',
      dex: 959,
      types: ['fairy', 'steel'],
      moves: { fast: 'Fairy Wind', charged: ['Gigaton Hammer*', 'Bulldoze'] },
    });
    expect(r.get('snorlax_shadow')).toMatchObject({ rank: 2, types: ['normal'] });
  });
  it('skips rows whose name is not in the gamemaster', () => {
    expect(r.size).toBe(2);
  });
});

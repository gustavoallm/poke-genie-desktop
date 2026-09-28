import { describe, it, expect } from 'vitest';
import { loadGamemaster } from '../../src/core/gamemaster.ts';
import { buildCandidates, loadMeta, movesFromNames } from '../../src/core/teams/build.ts';
import type { RankedPokemon } from '../../src/core/rank.ts';

const gm = loadGamemaster();
const iv = (rank: number, level: number) => ({ rank, level, cp: 2400, statProduct: 1, statProductPct: 95 });
const mon = (p: Partial<RankedPokemon>): RankedPokemon => ({
  speciesId: 'empoleon',
  species: 'Empoleon',
  nickname: null,
  cp: 2400,
  level: 30,
  ivs: { atk: 12, def: 13, hp: 14 },
  hpMax: 150,
  confidence: 'high',
  source: 'v',
  firstTimeSec: 0,
  ranked: true,
  speciesScore: 92.1,
  csvName: 'Empoleon',
  dex: 395,
  moves: null,
  iv50: iv(1130, 31.5),
  ...p,
});

describe('loadMeta', () => {
  it("takes pvpoke's top N with its movesets and weights", () => {
    const { meta, combatants } = loadMeta(gm, 2500, 10);
    expect(meta).toHaveLength(10);
    expect(meta[0]).toMatchObject({ speciesId: 'tinkaton', name: 'Tinkaton' });
    expect(meta[0].weight).toBeGreaterThan(90);
    expect(combatants[0].fast.moveId).toBe('FAIRY_WIND');
  });
});

describe('movesFromNames', () => {
  it('maps extracted move names to move ids', () => {
    expect(movesFromNames(gm, { fast: 'Waterfall', charged: ['Hydro Pump', 'Crunch'] })).toEqual(['WATERFALL', 'HYDRO_PUMP', 'CRUNCH']);
    expect(movesFromNames(gm, { fast: 'Not A Move', charged: [] })).toBeNull();
  });
});

describe('buildCandidates', () => {
  const ranked = [
    mon({ firstTimeSec: 1, iv50: iv(1130, 31.5) }),
    mon({ firstTimeSec: 2, iv50: iv(3000, 30) }),
    mon({
      speciesId: 'lapras',
      species: 'Lapras',
      csvName: 'Lapras',
      dex: 131,
      speciesScore: 90.5,
      firstTimeSec: 3,
      iv50: iv(2619, 37),
      moves: { fast: 'Ice Shard', charged: ['Surf', 'Skull Bash'] },
    }),
    mon({ speciesId: 'roselia', ranked: false, firstTimeSec: 4 }),
  ];
  const { candidates, combatants } = buildCandidates(gm, ranked, 2500, { top: 40 });

  it('keeps the best IV copy of each ranked species, simulated at its level under the cap', () => {
    expect(candidates.map(c => c.speciesId)).toEqual(['empoleon', 'lapras']);
    expect(candidates[0]).toMatchObject({ key: 'v@1', level: 31.5, currentLevel: 30 });
    expect(combatants).toHaveLength(2);
  });
  it("uses extracted moves when present, otherwise pvpoke's moveset with elite moves flagged", () => {
    expect(candidates[1]).toMatchObject({ moves: ['ICE_SHARD', 'SURF', 'SKULL_BASH'], assumedMoves: false, assumedElite: [] });
    expect(candidates[0].assumedMoves).toBe(true);
    expect(candidates[0].assumedElite).toContain('HYDRO_CANNON');
  });
  it('adds locked species even beyond the top N', () => {
    const { candidates: few } = buildCandidates(gm, ranked, 2500, { top: 1, locks: ['lapras'] });
    expect(few.map(c => c.speciesId)).toEqual(['empoleon', 'lapras']);
  });
});

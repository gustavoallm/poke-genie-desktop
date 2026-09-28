import { describe, it, expect } from 'vitest';
import type { RankedPokemon } from './types.ts';
import { lockOptions, moveLabel } from './teams.ts';

const mon = (speciesId: string | null, name: string, ranked = true): RankedPokemon => ({
  speciesId,
  species: name,
  csvName: name,
  nickname: null,
  cp: 2000,
  level: 30,
  ivs: null,
  hpMax: 100,
  confidence: 'high',
  source: 's',
  firstTimeSec: 0,
  moves: null,
  ranked,
});

describe('moveLabel', () => {
  it('turns move ids into readable names', () => {
    expect(moveLabel('HYDRO_CANNON')).toBe('Hydro Cannon');
    expect(moveLabel('X_SCISSOR')).toBe('X Scissor');
  });
});

describe('lockOptions', () => {
  it('lists each ranked species once, sorted by name', () => {
    const list = [
      mon('lapras', 'Lapras'),
      mon('empoleon', 'Empoleon'),
      mon('lapras', 'Lapras'),
      mon('roselia', 'Roselia', false),
      mon(null, 'Mewtwo'),
    ];
    expect(lockOptions(list)).toEqual([
      { speciesId: 'empoleon', name: 'Empoleon' },
      { speciesId: 'lapras', name: 'Lapras' },
    ]);
  });
});

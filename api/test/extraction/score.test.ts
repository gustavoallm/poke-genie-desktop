import { describe, it, expect } from 'vitest';
import { score } from '../../src/extraction/score.ts';

describe('score', () => {
  it('matches by CP and scores only fields present in truth', () => {
    const r = score(
      {
        source: 'x',
        bag: [
          { cp: 2708, name: '.M 89' },
          { cp: 1, name: 'junk' },
        ],
        pokemon: [
          {
            cp: 3844,
            cpReads: [3844],
            nickname: 'M 71',
            hp: { current: 223, max: 223 },
            species: 'Slaking',
            ivs: { atk: 1, def: 2, hp: 3 },
            types: null,
            candy: null,
            moves: null,
            frameCount: 3,
            firstTimeSec: 0,
          },
          {
            cp: 999,
            cpReads: [999],
            nickname: null,
            hp: null,
            species: null,
            ivs: null,
            types: null,
            candy: null,
            moves: null,
            frameCount: 2,
            firstTimeSec: 1,
          },
        ],
      },
      {
        pokemon: [
          { cp: 3844, nickname: '.M 71', species: 'Slaking', hpMax: 223, ivs: { atk: 1, def: 2, hp: 4 } },
          { cp: 3716, species: 'Dragonite' },
        ],
        bag: [
          { cp: 2708, name: '.M 89' },
          { cp: 2690, name: '.M 62' },
        ],
      },
    );
    expect(r.fields.cp).toEqual({ ok: 1, total: 2 });
    expect(r.fields.nickname).toEqual({ ok: 1, total: 1 });
    expect(r.fields.species).toEqual({ ok: 1, total: 2 });
    expect(r.fields.ivs).toEqual({ ok: 0, total: 1 });
    expect(r.fields.bagRecall).toEqual({ ok: 1, total: 2 });
    expect(r.fields.bagPrecision).toEqual({ ok: 1, total: 2 });
    expect(r.missed).toEqual([3716]);
    expect(r.extra).toEqual([999]);
  });
});

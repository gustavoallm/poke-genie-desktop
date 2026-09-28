import { describe, it, expect } from 'vitest';
import type { FrameResult } from '../../src/extraction/types.ts';
import { groupPokemon, dedupeBag } from '../../src/extraction/group.ts';

const f = (i: number, p: Partial<FrameResult>): FrameResult => ({ frameIndex: i, timeSec: i / 5, type: 'appraisal', ...p });

describe('groupPokemon', () => {
  it('splits by CP, votes fields and ignores a one-frame misread', () => {
    const frames = [
      f(0, { cp: 3844, species: 'Slaking', ivs: { atk: 12, def: 13, hp: 14 } }),
      f(1, { cp: 3844, species: 'Slakinq', ivs: { atk: 12, def: 13, hp: 14 } }),
      f(2, { cp: 3814, species: 'Slaking' }),
      f(3, { cp: 3844, species: 'Slaking', ivs: { atk: 12, def: 12, hp: 14 } }),
      f(4, { type: 'other' }),
      f(5, { cp: 3716, species: 'Dragonite' }),
      f(6, { cp: 3716, species: 'Dragonite', nickname: '.M 96' }),
      f(7, { type: 'detail', moves: { fast: 'Dragon Tail', charged: ['Outrage'] } }),
    ];
    const out = groupPokemon(frames, 2);
    expect(out.map(p => p.cp)).toEqual([3844, 3716]);
    expect(out[0]).toMatchObject({ species: 'Slaking', ivs: { atk: 12, def: 13, hp: 14 }, frameCount: 4 });
    expect(out[1]).toMatchObject({ nickname: '.M 96', moves: { fast: 'Dragon Tail', charged: ['Outrage'] } });
  });
  it('splits on HP max so frames with an unreadable CP still land on the right mon', () => {
    const hp = (max: number) => ({ current: max, max });
    const frames = [
      f(0, { type: 'detail', cp: 2905, hp: hp(168) }),
      f(1, { type: 'detail', hp: hp(168), moves: { fast: 'Waterfall', charged: ['Hydro Pump', 'Crunch'] } }),
      f(2, { cp: 2905, hp: hp(168), species: 'Gyarados' }),
      f(3, { type: 'detail', cp: 29, hp: hp(150) }),
      f(4, { type: 'detail', hp: hp(150), moves: { fast: 'Confusion', charged: ['Psystrike'] } }),
      f(5, { type: 'detail', hp: hp(150), moves: { fast: 'Confusion', charged: ['Psystrike'] } }),
      f(6, { cp: 2903, hp: hp(150), species: 'Mewtwo' }),
    ];
    const out = groupPokemon(frames, 2);
    expect(out.map(p => [p.species, p.moves?.fast])).toEqual([
      ['Gyarados', 'Waterfall'],
      ['Mewtwo', 'Confusion'],
    ]);
    expect(out[1].cpReads).toEqual([29, 2903]);
  });
  it('splits consecutive mons that share max HP when the species changes (Heatran then Dragonite, both HP 133)', () => {
    const hp133 = { current: 133, max: 133 };
    const frames = [
      f(0, { cp: 2119, hp: hp133, species: 'Heatran' }),
      f(1, { cp: 2119, hp: hp133, species: 'Heatran' }),
      f(2, { hp: hp133, species: 'Dragonite' }),
      f(3, { hp: hp133, species: 'Dragonite' }),
      f(4, { hp: hp133, species: 'Dragonite' }),
    ];
    expect(groupPokemon(frames, 2).map(p => p.species)).toEqual(['Heatran', 'Dragonite']);
  });
  it('splits two mons of the same species and max HP on a confirmed IV change (two Mewtwos, HP 133)', () => {
    const hp133 = { current: 133, max: 133 };
    // CP left unread (as in the full-HD video's low-CP stretch), so only the IVs can tell them apart.
    const m = (i: number, _cp: number, atk: number) => f(i, { hp: hp133, species: 'Mewtwo', ivs: { atk, def: 10, hp: 10 } });
    const frames = [m(0, 2331, 15), m(1, 2331, 15), m(2, 2331, 15), m(3, 2314, 13), m(4, 2316, 13), m(5, 2316, 13), m(6, 2316, 13)];
    expect(groupPokemon(frames, 2).map(p => p.ivs?.atk)).toEqual([15, 13]);
  });
  it('does not split a mon while its IV bars animate in after detail frames (Palkia)', () => {
    const hp = { current: 136, max: 136 };
    const frames = [
      f(0, { type: 'detail', cp: 2898, hp }),
      f(1, { type: 'detail', hp, moves: { fast: 'Dragon Tail', charged: ['Draco Meteor'] } }),
      f(2, { hp, species: 'Palkia', ivs: { atk: 10, def: 10, hp: 10 } }),
      f(3, { hp, species: 'Palkia', ivs: { atk: 12, def: 10, hp: 15 } }),
      f(4, { hp, species: 'Palkia', ivs: { atk: 12, def: 10, hp: 15 } }),
      f(5, { hp, species: 'Palkia', ivs: { atk: 12, def: 10, hp: 15 } }),
    ];
    const out = groupPokemon(frames, 2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ivs: { atk: 12, def: 10, hp: 15 }, moves: { fast: 'Dragon Tail' } });
  });
  it('does not split a mon on repeated CP misreads', () => {
    const hp = { current: 144, max: 144 };
    // The real read sequence for the Dialga in video-attack-plus-iv.
    const frames = [2876, 28, 23, 23, 23, 2875, 2875, 2875].map((cp, i) =>
      f(i, { cp, hp, species: 'Dialga', ivs: { atk: 13, def: 14, hp: 12 } }),
    );
    expect(groupPokemon(frames, 2)).toHaveLength(1);
  });
  it('drops groups below minFrames', () => {
    expect(groupPokemon([f(0, { cp: 100 })], 2)).toEqual([]);
    expect(groupPokemon([f(0, { cp: 100 })], 1)).toHaveLength(1);
  });
});

describe('dedupeBag', () => {
  it('keeps entries seen in at least minSeen frames', () => {
    const b = (i: number, bag: FrameResult['bag']) => f(i, { type: 'bag', bag });
    const out = dedupeBag(
      [
        b(0, [
          { cp: 2708, name: '.M 89' },
          { cp: 2700, name: '.M 89' },
        ]),
        b(1, [{ cp: 2708, name: 'M 89' }]),
      ],
      2,
    );
    expect(out).toEqual([{ cp: 2708, name: '.M 89' }]);
  });
});

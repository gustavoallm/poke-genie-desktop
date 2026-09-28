import { describe, it, expect } from 'vitest';
import type { PokemonRecord } from '../../src/extraction/types.ts';
import { correctSpecies, loadDex, solve } from '../../src/extraction/solve.ts';

const dex = loadDex();
const mon = (p: Partial<PokemonRecord>): PokemonRecord => ({
  cp: null,
  cpReads: [],
  nickname: null,
  hp: null,
  species: null,
  ivs: null,
  types: null,
  candy: null,
  moves: null,
  frameCount: 5,
  firstTimeSec: 0,
  ...p,
});
const hp = (max: number) => ({ current: max, max });

describe('solve', () => {
  it('recovers CP from garbage reads and resolves Origin forme (Dialga)', () => {
    const r = solve(mon({ species: 'Dialga', hp: hp(144), ivs: { atk: 13, def: 14, hp: 12 }, cp: 23, cpReads: [23, 28, 23, 2876] }), dex);
    expect(r).toMatchObject({ cp: 2875, speciesId: 'dialga_origin', level: 25, ivs: { atk: 13, def: 14, hp: 12 } });
  });
  it('recovers CP from partial reads (Palkia "898")', () => {
    const r = solve(mon({ species: 'Palkia', hp: hp(136), ivs: { atk: 12, def: 10, hp: 15 }, cp: 898, cpReads: [898, 898, 2898] }), dex);
    expect(r).toMatchObject({ cp: 2898, speciesId: 'palkia_origin' });
  });
  it('fills CP when none was read but IVs and HP pin it down (Slaking)', () => {
    const r = solve(mon({ species: 'Slaking', hp: hp(223), ivs: { atk: 13, def: 5, hp: 14 } }), dex);
    expect(r).toMatchObject({ cp: 3844, speciesId: 'slaking', level: 33 });
  });
  it('corrects an IV bar misread by one when the CP read confirms it (Salamence)', () => {
    const r = solve(mon({ species: 'Salamence', hp: hp(168), ivs: { atk: 12, def: 14, hp: 13 }, cp: 3204, cpReads: [3204, 3204] }), dex);
    expect(r).toMatchObject({ cp: 3204, ivs: { atk: 12, def: 14, hp: 12 }, level: 31 });
  });
  it('uses a truncated read ("37") to pick between two valid levels (Dragonite)', () => {
    const r = solve(mon({ species: 'Dragonite', hp: hp(175), ivs: { atk: 14, def: 14, hp: 15 }, cp: 37, cpReads: [37, 37] }), dex);
    expect(r).toMatchObject({ cp: 3716, level: 39 });
  });
  it('rates confidence: exact agreement is high, a corrected IV or partial CP evidence is medium', () => {
    const exact = solve(mon({ species: 'Salamence', hp: hp(168), ivs: { atk: 12, def: 14, hp: 12 }, cp: 3204, cpReads: [3204] }), dex);
    const corrected = solve(mon({ species: 'Salamence', hp: hp(168), ivs: { atk: 12, def: 14, hp: 13 }, cp: 3204, cpReads: [3204] }), dex);
    const partial = solve(mon({ species: 'Palkia', hp: hp(136), ivs: { atk: 12, def: 10, hp: 15 }, cp: 898, cpReads: [898] }), dex);
    expect([exact.confidence, corrected.confidence, partial.confidence]).toEqual(['high', 'medium', 'medium']);
    expect(solve(mon({ species: 'Notamon', hp: hp(100), cp: 1234, cpReads: [1234] }), dex).confidence).toBe('low');
  });
  it('leaves the record alone when species is unknown', () => {
    const m = mon({ species: 'Notamon', hp: hp(100), cp: 1234, cpReads: [1234] });
    expect(solve(m, dex)).toEqual({ ...m, confidence: 'low' });
  });
});

describe('correctSpecies', () => {
  it('fixes small OCR misreads of species names against the dex', () => {
    expect(correctSpecies(dex, 'Nidogqueen')).toBe('Nidoqueen');
    expect(correctSpecies(dex, 'lllumise')).toBe('Illumise');
    expect(correctSpecies(dex, 'Empoleon')).toBe('Empoleon');
    expect(correctSpecies(dex, 'Xyzzyqua')).toBe('Xyzzyqua');
  });
});

describe('solve with forms that share base stats', () => {
  const marowak = (types: string[] | null) =>
    mon({ species: 'Marowak', hp: hp(120), ivs: { atk: 14, def: 13, hp: 12 }, cp: 1490, cpReads: [1490, 1490], types });
  it('uses the types read from the screen to pick the form', () => {
    expect(solve(marowak(['FIRE']), dex)).toMatchObject({ speciesId: 'marowak_alolan' });
    expect(solve(marowak(['GROUND']), dex)).toMatchObject({ speciesId: 'marowak' });
  });
  it('flags the other possible forms when the types were not visible', () => {
    const r = solve(marowak(null), dex);
    expect(r.formAlternatives).toContain(r.speciesId === 'marowak' ? 'marowak_alolan' : 'marowak');
    expect(solve(marowak(['FIRE']), dex).formAlternatives ?? []).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { effectiveness } from '../../src/core/battle/typechart.ts';
import { buildCombatant, buffMultiplier } from '../../src/core/battle/combatant.ts';
import { damage } from '../../src/core/battle/damage.ts';
import { loadGamemaster } from '../../src/core/gamemaster.ts';

const gm = loadGamemaster();

describe('effectiveness', () => {
  it('multiplies per defending type, with GO immunities as double resistance', () => {
    expect(effectiveness('water', ['fire', 'flying'])).toBeCloseTo(1.6);
    expect(effectiveness('rock', ['fire', 'flying'])).toBeCloseTo(2.56);
    expect(effectiveness('fighting', ['ghost'])).toBeCloseTo(0.390625);
    expect(effectiveness('ground', ['flying', 'steel'])).toBeCloseTo(0.625);
    expect(effectiveness('normal', ['water'])).toBe(1);
  });
});

describe('buffMultiplier', () => {
  it('follows pvpoke stages with divisor 4, clamped to ±4', () => {
    expect(buffMultiplier(0)).toBe(1);
    expect(buffMultiplier(2)).toBe(1.5);
    expect(buffMultiplier(-2)).toBeCloseTo(4 / 6);
    expect(buffMultiplier(9)).toBe(2);
  });
});

describe('buildCombatant', () => {
  it('computes stats from IVs and level like pvpoke (Tinkaton 12/15/15 at level 50)', () => {
    const c = buildCombatant(gm, 'tinkaton', { atk: 12, def: 15, hp: 15 }, 50, ['FAIRY_WIND', 'GIGATON_HAMMER', 'BULLDOZE']);
    expect(c.atk).toBeCloseTo(140.3, 1);
    expect(c.def).toBeCloseTo(177.3, 1);
    expect(c.maxHp).toBe(178);
    expect(c.fast.moveId).toBe('FAIRY_WIND');
    expect(c.charged.map(m => m.moveId)).toEqual(['GIGATON_HAMMER', 'BULLDOZE']);
  });
  it('applies shadow multipliers for _shadow species', () => {
    const plain = buildCombatant(gm, 'snorlax', { atk: 5, def: 15, hp: 14 }, 28.5, ['LICK', 'BODY_SLAM']);
    const shadow = buildCombatant(gm, 'snorlax_shadow', { atk: 5, def: 15, hp: 14 }, 28.5, ['LICK', 'BODY_SLAM']);
    expect(shadow.atk / plain.atk).toBeCloseTo(1.2);
    expect(shadow.def / plain.def).toBeCloseTo(5 / 6);
  });
});

describe('damage', () => {
  it('applies the PvP formula with STAB and effectiveness', () => {
    const empoleon = buildCombatant(gm, 'empoleon', { atk: 6, def: 15, hp: 14 }, 33, ['METAL_SOUND', 'HYDRO_CANNON', 'DRILL_PECK']);
    const charizard = buildCombatant(gm, 'charizard', { atk: 8, def: 14, hp: 15 }, 32.5, ['FIRE_SPIN', 'BLAST_BURN']);
    const hydroCannon = empoleon.charged[0];
    const expected = Math.floor(0.5 * 80 * (empoleon.atk / charizard.def) * 1.2 * 1.6 * 1.3) + 1;
    expect(damage(empoleon, charizard, hydroCannon)).toBe(expected);
  });
  it('scales with attack and defense buffs', () => {
    const a = buildCombatant(gm, 'empoleon', { atk: 6, def: 15, hp: 14 }, 33, ['METAL_SOUND', 'HYDRO_CANNON']);
    const b = buildCombatant(gm, 'empoleon', { atk: 6, def: 15, hp: 14 }, 33, ['METAL_SOUND', 'HYDRO_CANNON']);
    const base = damage(a, b, a.charged[0]);
    expect(damage(a, b, a.charged[0], { atkStage: 2, defStage: 0 })).toBeGreaterThan(base);
    expect(damage(a, b, a.charged[0], { atkStage: 0, defStage: 2 })).toBeLessThan(base);
  });
});

import { describe, it, expect } from 'vitest';
import { consistentIvs, cpOf, hpOf, LEVELS } from '../../src/core/cp.ts';

const SALAMENCE = { atk: 277, def: 168, hp: 216 };

describe('cp formula', () => {
  it('matches a known in-game value (Salamence 12/14/12 at level 31 = CP 3204, HP 168)', () => {
    const cpm = LEVELS.find(l => l.level === 31)!.cpm;
    expect(cpOf(SALAMENCE, { atk: 12, def: 14, hp: 12 }, cpm)).toBe(3204);
    expect(hpOf(SALAMENCE, { atk: 12, def: 14, hp: 12 }, cpm)).toBe(168);
  });
  it('has 101 levels from 1 to 51', () => {
    expect(LEVELS).toHaveLength(101);
    expect(LEVELS[LEVELS.length - 1].level).toBe(51);
  });
  it('lists the IV spreads consistent with CP and HP', () => {
    const found = consistentIvs(SALAMENCE, 3204, 168).map(c => `${c.ivs.atk}/${c.ivs.def}/${c.ivs.hp}@${c.level}`);
    expect(found).toContain('12/14/12@31');
  });
});

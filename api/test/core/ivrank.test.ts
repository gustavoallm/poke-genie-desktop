import { describe, it, expect } from 'vitest';
import { bestUnderCap, createIvRanker, LEAGUE_CAPS } from '../../src/core/ivrank.ts';
import { loadGamemaster } from '../../src/core/gamemaster.ts';

const gm = loadGamemaster();
const stats = (id: string) => gm.statsById.get(id)!;

describe('bestUnderCap', () => {
  it('reproduces pvpoke CSV rows (default IVs from the gamemaster)', () => {
    const tink = bestUnderCap(stats('tinkaton'), { atk: 12, def: 15, hp: 15 }, 2500, 50)!;
    expect(tink).toMatchObject({ level: 50, cp: 2499 });
    expect(Math.abs(tink.statProduct - 4428816)).toBeLessThan(2);
    expect(bestUnderCap(stats('corviknight'), { atk: 4, def: 14, hp: 13 }, 2500, 50)).toMatchObject({ level: 47, cp: 2497 });
  });
  it('stops at maxLevel when the cap is out of reach', () => {
    expect(bestUnderCap(stats('magikarp'), { atk: 15, def: 15, hp: 15 }, 2500, 50)!.level).toBe(50);
    expect(bestUnderCap(stats('magikarp'), { atk: 15, def: 15, hp: 15 }, 2500, 51)!.level).toBe(51);
  });
  it('uses maxLevel with no cap (master league)', () => {
    expect(bestUnderCap(stats('dialga'), { atk: 15, def: 15, hp: 15 }, LEAGUE_CAPS.master, 50)!.level).toBe(50);
  });
});

describe('createIvRanker', () => {
  const rank = createIvRanker(2500, 50);
  it('ranks 1..4096 with the best spread at 100%', () => {
    const base = stats('empoleon');
    const all = [];
    for (let a = 0; a < 16; a++)
      for (let d = 0; d < 16; d++) for (let h = 0; h < 16; h++) all.push(rank('empoleon', base, { atk: a, def: d, hp: h })!);
    const best = all.find(r => r.rank === 1)!;
    expect(best.statProductPct).toBeCloseTo(100, 6);
    expect(Math.max(...all.map(r => r.rank))).toBeLessThanOrEqual(4096);
    expect(Math.min(...all.map(r => r.statProductPct))).toBeGreaterThan(0);
  });
  it('ranks a low-attack high-bulk spread above a 15/15/15 in a capped league', () => {
    const base = stats('empoleon');
    expect(rank('empoleon', base, { atk: 0, def: 15, hp: 15 })!.rank).toBeLessThan(
      rank('empoleon', base, { atk: 15, def: 15, hp: 15 })!.rank,
    );
  });
});

import { LEVELS, cpOf, type BaseStats } from './cp.ts';
import type { Ivs } from './types.ts';

export type League = 'great' | 'ultra' | 'master';
export const LEAGUE_CAPS: Record<League, number> = { great: 1500, ultra: 2500, master: Infinity };

export interface SpreadStats {
  level: number;
  cp: number;
  statProduct: number;
}
export interface IvRankResult extends SpreadStats {
  rank: number;
  statProductPct: number;
}

/** Highest level up to maxLevel whose CP stays within the cap, and the stat product there. */
export function bestUnderCap(base: BaseStats, ivs: Ivs, cap: number, maxLevel: number): SpreadStats | null {
  // CP only grows with level, so binary-search the highest level index whose CP fits the cap.
  let hi = LEVELS.length - 1;
  while (hi >= 0 && LEVELS[hi].level > maxLevel) hi--;
  let lo = 0,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cpOf(base, ivs, LEVELS[mid].cpm) <= cap) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const { level, cpm } = LEVELS[found];
  const statProduct = (base.atk + ivs.atk) * cpm * (base.def + ivs.def) * cpm * Math.floor((base.hp + ivs.hp) * cpm);
  return { level, cp: cpOf(base, ivs, cpm), statProduct };
}

/** Ranks a spread among all 4096 for its species; the per-species table is computed once and cached. */
export function createIvRanker(cap: number, maxLevel: number) {
  const tables = new Map<string, { products: number[]; best: number }>();
  const table = (speciesId: string, base: BaseStats) => {
    let t = tables.get(speciesId);
    if (!t) {
      const products: number[] = [];
      for (let atk = 0; atk < 16; atk++)
        for (let def = 0; def < 16; def++)
          for (let hp = 0; hp < 16; hp++) {
            const s = bestUnderCap(base, { atk, def, hp }, cap, maxLevel);
            if (s) products.push(s.statProduct);
          }
      t = { products, best: Math.max(...products) };
      tables.set(speciesId, t);
    }
    return t;
  };
  return (speciesId: string, base: BaseStats, ivs: Ivs): IvRankResult | null => {
    const own = bestUnderCap(base, ivs, cap, maxLevel);
    if (!own) return null;
    const t = table(speciesId, base);
    const rank = 1 + t.products.filter(p => p > own.statProduct).length;
    return { ...own, rank, statProductPct: (own.statProduct / t.best) * 100 };
  };
}

import type { Ivs } from './types.ts';

// CP multipliers for whole levels 1..51; half levels are the quadratic mean of neighbours.
const WHOLE_CPM = [
  0.094, 0.16639787, 0.21573247, 0.25572005, 0.29024988, 0.3210876, 0.34921268, 0.3752356, 0.39956728, 0.4225, 0.44310755, 0.4627984,
  0.48168495, 0.49985844, 0.51739395, 0.5343543, 0.5507927, 0.5667545, 0.5822789, 0.5974, 0.6121573, 0.6265671, 0.64065295, 0.65443563,
  0.667934, 0.6811649, 0.69414365, 0.7068842, 0.7193991, 0.7317, 0.7377695, 0.74378943, 0.74976104, 0.7556855, 0.76156384, 0.76739717,
  0.7731865, 0.77893275, 0.784637, 0.7903, 0.7953, 0.8003, 0.8053, 0.8103, 0.8153, 0.8203, 0.8253, 0.8303, 0.8353, 0.8403, 0.8453,
];

export const LEVELS: Array<{ level: number; cpm: number }> = WHOLE_CPM.flatMap((cpm, i) => {
  const next = WHOLE_CPM[i + 1];
  const whole = { level: i + 1, cpm };
  return next === undefined ? [whole] : [whole, { level: i + 1.5, cpm: Math.sqrt((cpm * cpm + next * next) / 2) }];
});

export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
}

export function cpOf(base: BaseStats, iv: Ivs, cpm: number): number {
  const cp = Math.floor(((base.atk + iv.atk) * Math.sqrt(base.def + iv.def) * Math.sqrt(base.hp + iv.hp) * cpm * cpm) / 10);
  return Math.max(10, cp);
}

export function hpOf(base: BaseStats, iv: Ivs, cpm: number): number {
  return Math.max(10, Math.floor((base.hp + iv.hp) * cpm));
}

/** All (IVs, level) combos that produce exactly this CP and max HP. */
export function consistentIvs(base: BaseStats, cp: number, hpMax: number): Array<{ ivs: Ivs; level: number }> {
  const out: Array<{ ivs: Ivs; level: number }> = [];
  for (const { level, cpm } of LEVELS) {
    for (let hp = 0; hp <= 15; hp++) {
      if (hpOf(base, { atk: 0, def: 0, hp }, cpm) !== hpMax) continue;
      for (let atk = 0; atk <= 15; atk++)
        for (let def = 0; def <= 15; def++) {
          const ivs = { atk, def, hp };
          if (cpOf(base, ivs, cpm) === cp) out.push({ ivs, level });
        }
    }
  }
  return out;
}

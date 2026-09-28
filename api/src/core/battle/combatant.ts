import { LEVELS } from '../cp.ts';
import type { Gamemaster, GmMove } from '../gamemaster.ts';
import type { Ivs } from '../types.ts';

export interface Combatant {
  speciesId: string;
  types: string[];
  atk: number;
  def: number;
  maxHp: number;
  fast: GmMove;
  charged: GmMove[];
}

const SHADOW_ATK = 1.2;
const SHADOW_DEF = 5 / 6;
const MAX_STAGE = 4;
const BUFF_DIVISOR = 4;

/** pvpoke buff stages: +n → (4+n)/4, −n → 4/(4+n), clamped to ±4. */
export function buffMultiplier(stage: number): number {
  const s = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
  return s >= 0 ? (BUFF_DIVISOR + s) / BUFF_DIVISOR : BUFF_DIVISOR / (BUFF_DIVISOR - s);
}

/** moves = [fastMoveId, chargedMoveId, chargedMoveId?]. */
export function buildCombatant(gm: Gamemaster, speciesId: string, ivs: Ivs, level: number, moves: string[]): Combatant {
  const species = gm.byId.get(speciesId);
  if (!species) throw new Error(`Unknown species ${speciesId}`);
  const cpm = LEVELS.find(l => l.level === level)?.cpm;
  if (!cpm) throw new Error(`Unknown level ${level}`);
  const move = (id: string) => {
    const m = gm.moves.get(id);
    if (!m) throw new Error(`Unknown move ${id}`);
    return m;
  };
  const shadow = speciesId.endsWith('_shadow');
  const b = species.baseStats;
  return {
    speciesId,
    types: species.types.filter(t => t !== 'none'),
    atk: (b.atk + ivs.atk) * cpm * (shadow ? SHADOW_ATK : 1),
    def: (b.def + ivs.def) * cpm * (shadow ? SHADOW_DEF : 1),
    maxHp: Math.max(10, Math.floor((b.hp + ivs.hp) * cpm)),
    fast: move(moves[0]),
    charged: moves.slice(1).filter(Boolean).map(move),
  };
}

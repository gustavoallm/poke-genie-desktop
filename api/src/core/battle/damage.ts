import type { GmMove } from '../gamemaster.ts';
import { buffMultiplier, type Combatant } from './combatant.ts';
import { effectiveness } from './typechart.ts';

const STAB = 1.2;
const PVP_BONUS = 1.3;

export interface Stages {
  atkStage: number;
  defStage: number;
}

/**
 * pvpoke's PvP damage: ⌊0.5 · power · atk/def · STAB · effectiveness · 1.3⌋ + 1.
 * `stages` carries the attacker's attack stage and the defender's defense stage.
 */
export function damage(attacker: Combatant, defender: Combatant, move: GmMove, stages: Stages = { atkStage: 0, defStage: 0 }): number {
  const atk = attacker.atk * buffMultiplier(stages.atkStage);
  const def = defender.def * buffMultiplier(stages.defStage);
  const stab = attacker.types.includes(move.type) ? STAB : 1;
  return Math.floor(0.5 * move.power * (atk / def) * stab * effectiveness(move.type, defender.types) * PVP_BONUS) + 1;
}

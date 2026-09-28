import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/core/battle/battle.ts';
import { buildCombatant } from '../../src/core/battle/combatant.ts';
import { pvpokeAgreement } from '../../src/core/battle/pvpoke-check.ts';
import { loadGamemaster } from '../../src/core/gamemaster.ts';

const gm = loadGamemaster();
const empoleon = (moves: string[]) => buildCombatant(gm, 'empoleon', { atk: 6, def: 15, hp: 14 }, 33, moves);

describe('simulate', () => {
  it('rates a mirror as a near tie', () => {
    const r = simulate(
      empoleon(['METAL_SOUND', 'HYDRO_CANNON', 'DRILL_PECK']),
      empoleon(['METAL_SOUND', 'HYDRO_CANNON', 'DRILL_PECK']),
      [1, 1],
    );
    expect(Math.abs(r.rating - 500)).toBeLessThan(60);
  });
  it('a mon with a charged move beats its mirror without one', () => {
    const r = simulate(empoleon(['METAL_SOUND', 'HYDRO_CANNON']), empoleon(['METAL_SOUND']), [0, 0]);
    expect(r.winner).toBe('a');
    expect(r.rating).toBeGreaterThan(500);
  });
  it('shields absorb charged moves', () => {
    const a = () => empoleon(['METAL_SOUND', 'HYDRO_CANNON']);
    const unshielded = simulate(a(), a(), [0, 0]);
    const bShields = simulate(a(), a(), [0, 2]);
    expect(bShields.rating).toBeLessThan(unshielded.rating);
  });
  it('is deterministic', () => {
    const a = empoleon(['METAL_SOUND', 'HYDRO_CANNON', 'DRILL_PECK']);
    const b = buildCombatant(gm, 'charizard', { atk: 8, def: 14, hp: 15 }, 32.5, ['FIRE_SPIN', 'BLAST_BURN', 'DRAGON_CLAW']);
    expect(simulate(a, b, [1, 1])).toEqual(simulate(a, b, [1, 1]));
  });
  it('logs turns when asked', () => {
    const lines: string[] = [];
    simulate(empoleon(['METAL_SOUND', 'HYDRO_CANNON']), empoleon(['METAL_SOUND']), [0, 0], l => lines.push(l));
    expect(lines.some(l => l.includes('HYDRO_CANNON'))).toBe(true);
  });
});

describe('agreement with pvpoke (top 100 species, their listed best wins and worst losses)', () => {
  it.each([
    [2500, [1, 1]],
    [1500, [1, 1]],
    [2500, [0, 0]],
  ] as const)('cap %i shields %j agrees on the winner at least 85% of the time', (cap, shields) => {
    const { agreement, cases } = pvpokeAgreement(gm, cap, 100, [...shields] as [number, number]);
    expect(cases.length).toBeGreaterThan(900);
    expect(agreement).toBeGreaterThanOrEqual(0.85);
  });
});

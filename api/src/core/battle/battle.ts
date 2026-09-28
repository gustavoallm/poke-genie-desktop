import type { GmMove } from '../gamemaster.ts';
import type { Combatant } from './combatant.ts';
import { damage } from './damage.ts';

const MAX_ENERGY = 100;
const MAX_STAGE = 4;
const TIME_LIMIT_TURNS = 480; // 4 minutes of 0.5 s turns

interface Side {
  c: Combatant;
  hp: number;
  energy: number;
  shields: number;
  /** Turns left on the fast move in progress; 0 = free to act. */
  cooldown: number;
  atkStage: number;
  defStage: number;
  /** Mimikyu's Disguise: blocks the first charged move that would hit it. */
  disguise: boolean;
}

export interface BattleResult {
  /** pvpoke battle rating from a's side: 500 = tie, > 500 = a wins. */
  rating: number;
  winner: 'a' | 'b' | 'tie';
  turns: number;
}

const clampStage = (s: number) => Math.max(-MAX_STAGE, Math.min(MAX_STAGE, s));
const dmg = (me: Side, opp: Side, move: GmMove) => damage(me.c, opp.c, move, { atkStage: me.atkStage, defStage: opp.defStage });

/** Fast moves `opp` completes during the next `window` turns (its current move included). */
function oppFastHits(opp: Side, window: number): number {
  const t = opp.c.fast.turns;
  if (opp.cooldown > 0) return window >= opp.cooldown ? 1 + Math.floor((window - opp.cooldown) / t) : 0;
  return Math.floor(window / t);
}

type Action = 'fast' | GmMove;

/** Simplified pvpoke action logic for a Pokémon that is free to act this turn. */
function decide(me: Side, opp: Side): Action {
  const affordable = me.c.charged.filter(m => me.energy >= m.energy);
  if (!affordable.length) return 'fast';

  const byDamage = [...affordable].sort((x, y) => dmg(me, opp, y) - dmg(me, opp, x));
  const cheapest = [...affordable].sort((x, y) => x.energy - y.energy || dmg(me, opp, y) - dmg(me, opp, x))[0];
  const kos = affordable.filter(m => opp.shields === 0 && dmg(me, opp, m) >= opp.hp).sort((x, y) => x.energy - y.energy);

  // Use it or lose it: throw now if we might faint before our next fast move lands.
  const window = me.c.fast.turns;
  const fastThreat = dmg(opp, me, opp.c.fast) * oppFastHits(opp, window);
  const chargedThreat = me.shields === 0 && opp.c.charged.some(m => opp.energy >= m.energy && dmg(opp, me, m) >= me.hp);
  if (fastThreat >= me.hp || chargedThreat) return kos[0] ?? byDamage[0];

  // A fast move finishes the job: don't spend energy.
  if (dmg(me, opp, me.c.fast) >= opp.hp) return 'fast';

  // Bait shields with the cheapest move.
  if (opp.shields > 0) return cheapest;

  if (kos.length) return kos[0];
  // Build toward the most energy-efficient move (damage per energy) while it is safe to wait.
  const dpe = (m: GmMove) => dmg(me, opp, m) / m.energy;
  const efficient = [...me.c.charged].sort((x, y) => dpe(y) - dpe(x))[0];
  if (me.energy >= efficient.energy) return efficient;
  if (safeToWaitFor(efficient, me, opp)) return 'fast';
  return byDamage[0];
}

/** Can we farm fast moves until `move` is affordable without the opponent being able to KO us first? */
function safeToWaitFor(move: GmMove, me: Side, opp: Side): boolean {
  const fastNeeded = Math.ceil((move.energy - me.energy) / Math.max(1, me.c.fast.energyGain));
  const window = fastNeeded * me.c.fast.turns;
  const oppHits = oppFastHits(opp, window);
  let incoming = dmg(opp, me, opp.c.fast) * oppHits;
  if (me.shields === 0) {
    const oppEnergy = Math.min(MAX_ENERGY, opp.energy + oppHits * opp.c.fast.energyGain);
    const reachable = opp.c.charged.filter(m => oppEnergy >= m.energy);
    if (reachable.length) incoming += Math.max(...reachable.map(m => dmg(opp, me, m)));
  }
  return incoming < me.hp;
}

function applyBuffs(move: GmMove, user: Side, target: Side) {
  if (!move.buffTarget || Number(move.buffApplyChance ?? 0) < 1) return; // only guaranteed buffs are modelled
  const add = (s: Side, [a, d]: [number, number]) => {
    s.atkStage = clampStage(s.atkStage + a);
    s.defStage = clampStage(s.defStage + d);
  };
  if (move.buffTarget === 'self' && move.buffs) add(user, move.buffs);
  if (move.buffTarget === 'opponent' && move.buffs) add(target, move.buffs);
  if (move.buffTarget === 'both') {
    if (move.buffsSelf) add(user, move.buffsSelf);
    if (move.buffsOpponent) add(target, move.buffsOpponent);
  }
}

/** Returns whether the move was shielded. */
function throwCharged(user: Side, target: Side, move: GmMove): boolean {
  user.energy -= move.energy;
  let shielded = false;
  if (target.disguise) {
    target.disguise = false;
    target.hp -= 1;
  } else if (target.shields > 0) {
    // Always shielding matched pvpoke best (vs shielding only big or lethal hits, measured 2026-09-27).
    target.shields--;
    target.hp -= 1;
    shielded = true;
  } else {
    target.hp -= dmg(user, target, move);
  }
  applyBuffs(move, user, target);
  return shielded;
}

export function simulate(a: Combatant, b: Combatant, shields: [number, number], log?: (line: string) => void): BattleResult {
  const side = (c: Combatant, s: number): Side => ({
    c,
    hp: c.maxHp,
    energy: 0,
    shields: s,
    cooldown: 0,
    atkStage: 0,
    defStage: 0,
    disguise: c.speciesId === 'mimikyu',
  });
  const A = side(a, shields[0]);
  const B = side(b, shields[1]);
  let turn = 0;

  while (A.hp > 0 && B.hp > 0 && turn < TIME_LIMIT_TURNS) {
    turn++;
    const actA = A.cooldown === 0 ? decide(A, B) : null;
    const actB = B.cooldown === 0 ? decide(B, A) : null;
    const chargedA = actA && actA !== 'fast' ? actA : null;
    const chargedB = actB && actB !== 'fast' ? actB : null;

    if (chargedA || chargedB) {
      // Charged moves pause the clock. Simultaneous throws resolve higher attack first (CMP).
      const order: Array<[Side, Side, GmMove]> = [];
      if (chargedA) order.push([A, B, chargedA]);
      if (chargedB) order.push([B, A, chargedB]);
      order.sort((x, y) => y[0].c.atk - x[0].c.atk);
      // pvpoke breaks exact CMP ties at random; deterministically, both moves land.
      const cmpTie = order.length === 2 && order[0][0].c.atk === order[1][0].c.atk;
      for (const [user, target, move] of order) {
        if (user.hp <= 0 && !cmpTie) continue;
        const shielded = throwCharged(user, target, move);
        log?.(
          `t${turn} ${user.c.speciesId} ${move.moveId}${shielded ? ' (shielded)' : ''} -> ${target.c.speciesId} hp ${target.hp}, energy ${user.energy}`,
        );
      }
      continue;
    }

    // Start fast moves, then advance both clocks; damage and energy land when a move completes.
    if (actA === 'fast') A.cooldown = A.c.fast.turns;
    if (actB === 'fast') B.cooldown = B.c.fast.turns;
    const hits: Array<[Side, Side]> = [];
    for (const [me, opp] of [
      [A, B],
      [B, A],
    ] as const) {
      if (me.cooldown > 0 && --me.cooldown === 0) hits.push([me, opp]);
    }
    const dealt = hits.map(([me, opp]) => dmg(me, opp, me.c.fast)); // simultaneous: computed before either lands
    hits.forEach(([me, opp], i) => {
      opp.hp -= dealt[i];
      log?.(
        `t${turn} ${me.c.speciesId} ${me.c.fast.moveId} ${dealt[i]} -> hp ${opp.hp}, energy ${Math.min(MAX_ENERGY, me.energy + me.c.fast.energyGain)}`,
      );
      me.energy = Math.min(MAX_ENERGY, me.energy + me.c.fast.energyGain);
      applyBuffs(me.c.fast, me, opp);
    });
  }

  const hpA = Math.max(0, A.hp),
    hpB = Math.max(0, B.hp);
  const rating = Math.floor((500 * (b.maxHp - hpB)) / b.maxHp + (500 * hpA) / a.maxHp);
  const winner = hpA > 0 && hpB <= 0 ? 'a' : hpB > 0 && hpA <= 0 ? 'b' : rating > 500 ? 'a' : rating < 500 ? 'b' : 'tie';
  return { rating, winner, turns: turn };
}

import type { BagEntry, FrameResult, PokemonRecord } from './types.ts';
import { normalizeName } from './parse.ts';

function vote<T>(values: (T | undefined)[]): T | null {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    if (v === undefined) continue;
    const k = JSON.stringify(v);
    const e = counts.get(k);
    if (e) e.n++;
    else counts.set(k, { v, n: 1 });
  }
  let best: { v: T; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best ? best.v : null;
}

/**
 * A key change only starts a new mon if `confirmations` of the next two frames carrying that key agree
 * with it, and the current mon's value is backed by at least `established` frames; otherwise it is
 * treated as an OCR misread (or an animation frame) and outvoted inside the current group.
 */
function startsNewGroup<T>(
  key: (f: FrameResult) => T | undefined,
  fr: FrameResult,
  rest: FrameResult[],
  current: FrameResult[],
  { confirmations = 1, established = 1 } = {},
): boolean {
  const k = key(fr);
  if (k === undefined) return false;
  const currentKey = vote(current.map(key));
  if (currentKey === null || JSON.stringify(k) === JSON.stringify(currentKey)) return false;
  const support = current.filter(c => JSON.stringify(key(c)) === JSON.stringify(currentKey)).length;
  if (support < established) return false;
  return (
    rest
      .filter(n => key(n) !== undefined)
      .slice(0, 2)
      .filter(n => JSON.stringify(key(n)) === JSON.stringify(k)).length >= confirmations
  );
}

export function groupPokemon(frames: FrameResult[], minFrames: number): PokemonRecord[] {
  const relevant = frames.filter(f => f.type === 'appraisal' || f.type === 'detail');
  const groups: FrameResult[][] = [];
  for (const [i, fr] of relevant.entries()) {
    const current = groups[groups.length - 1];
    const rest = relevant.slice(i + 1);
    // A confirmed change of an identity field starts a new mon. HP max and species read reliably, so one
    // confirming frame is enough. IVs separate consecutive mons that share species and max HP (two
    // Mewtwos with 133 HP); they must be established and doubly confirmed, because the bars animate in.
    // CP and nicknames are too noisy to split on (repeated misreads like "23" would split a mon).
    const isNew =
      !current ||
      startsNewGroup(f => f.hp?.max, fr, rest, current) ||
      startsNewGroup(f => f.species?.toUpperCase(), fr, rest, current) ||
      startsNewGroup(f => f.ivs, fr, rest, current, { confirmations: 2, established: 2 });
    if (isNew) groups.push([fr]);
    else current.push(fr);
  }
  return groups
    .filter(g => g.length >= minFrames && g.some(f => f.cp !== undefined || (f.species !== undefined && f.hp !== undefined)))
    .map(g => ({
      cp: vote(g.map(f => f.cp)),
      cpReads: g.flatMap(f => (f.cp === undefined ? [] : [f.cp])),
      nickname: vote(g.map(f => f.nickname)),
      hp: vote(g.map(f => f.hp)),
      species: vote(g.map(f => f.species)),
      ivs: vote(g.map(f => f.ivs)),
      types: vote(g.map(f => f.types)),
      candy: vote(g.map(f => f.candy)),
      moves: vote(g.map(f => f.moves)),
      frameCount: g.length,
      firstTimeSec: g[0].timeSec,
    }));
}

export function dedupeBag(frames: FrameResult[], minSeen: number): BagEntry[] {
  const seen = new Map<string, { entry: BagEntry; n: number }>();
  for (const f of frames) {
    for (const e of f.bag ?? []) {
      const k = `${e.cp}|${normalizeName(e.name)}`;
      const s = seen.get(k);
      if (s) s.n++;
      else seen.set(k, { entry: e, n: 1 });
    }
  }
  return [...seen.values()].filter(s => s.n >= minSeen).map(s => s.entry);
}

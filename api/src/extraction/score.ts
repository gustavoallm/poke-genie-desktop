import type { BagEntry, Ivs, Moves, Output } from './types.ts';
import { normalizeName } from './parse.ts';

export interface TruthMon {
  cp: number;
  nickname?: string;
  species?: string;
  hpMax?: number;
  ivs?: Ivs;
  moves?: Moves;
}
export interface Truth {
  pokemon: TruthMon[];
  bag?: BagEntry[];
}
export interface Report {
  fields: Record<string, { ok: number; total: number }>;
  missed: number[];
  extra: Array<number | null>;
}

export function score(out: Output, truth: Truth): Report {
  const fields: Report['fields'] = {};
  const tally = (k: string, ok: boolean) => {
    fields[k] ??= { ok: 0, total: 0 };
    fields[k].total++;
    if (ok) fields[k].ok++;
  };
  const missed: number[] = [];
  for (const t of truth.pokemon) {
    const p = out.pokemon.find(x => x.cp === t.cp);
    tally('cp', !!p);
    if (!p) missed.push(t.cp);
    if (t.nickname !== undefined) tally('nickname', !!p?.nickname && normalizeName(p.nickname) === normalizeName(t.nickname));
    if (t.species !== undefined) tally('species', p?.species?.toUpperCase() === t.species.toUpperCase());
    if (t.hpMax !== undefined) tally('hp', p?.hp?.max === t.hpMax);
    if (t.ivs !== undefined) tally('ivs', JSON.stringify(p?.ivs) === JSON.stringify(t.ivs));
    if (t.moves !== undefined) tally('moves', JSON.stringify(p?.moves) === JSON.stringify(t.moves));
  }
  const extra = out.pokemon.filter(p => !truth.pokemon.some(t => t.cp === p.cp)).map(p => p.cp);
  if (truth.bag) {
    const key = (e: BagEntry) => `${e.cp}|${normalizeName(e.name)}`;
    const got = new Set(out.bag.map(key));
    const want = new Set(truth.bag.map(key));
    for (const k of want) tally('bagRecall', got.has(k));
    for (const k of got) tally('bagPrecision', want.has(k));
  }
  return { fields, missed, extra };
}

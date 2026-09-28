import fs from 'node:fs';
import path from 'node:path';
import { DATA } from '../paths.ts';
import type { Ivs, PokemonRecord } from './types.ts';
import { cpOf, hpOf, LEVELS, type BaseStats } from '../core/cp.ts';

export interface Form {
  speciesId: string;
  baseName: string;
  types: string[];
  baseStats: BaseStats;
}
export type Dex = Map<string, Form[]>;

interface GmPokemon {
  speciesId: string;
  speciesName: string;
  types: string[];
  baseStats: BaseStats;
}

/** Forms per base species name, e.g. "PALKIA" -> [palkia, palkia_origin]. Shadow/mega/primal are excluded. */
export function loadDex(file = path.join(DATA, 'gamemaster.json')): Dex {
  const gm = JSON.parse(fs.readFileSync(file, 'utf8')) as { pokemon: GmPokemon[] };
  const dex: Dex = new Map();
  for (const p of gm.pokemon) {
    if (/_(shadow|mega|primal)/.test(p.speciesId)) continue;
    const baseName = p.speciesName.replace(/\s*\(.*\)$/, '');
    const key = baseName.toUpperCase();
    const types = p.types.filter(t => t !== 'none');
    dex.set(key, [...(dex.get(key) ?? []), { speciesId: p.speciesId, baseName, types, baseStats: p.baseStats }]);
  }
  return dex;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

const MAX_NAME_EDITS = 2;

/** Fixes small OCR misreads of a species name ("Nidogqueen", "lllumise") when exactly one dex name is that close. */
export function correctSpecies(dex: Dex, name: string): string {
  const key = name.toUpperCase();
  if (dex.has(key) || key.length < 5) return name;
  let best: string | null = null,
    bestD = Infinity,
    tie = false;
  for (const k of dex.keys()) {
    const d = editDistance(key, k);
    if (d < bestD) {
      best = k;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  return best && bestD <= MAX_NAME_EDITS && !tie ? dex.get(best)![0].baseName : name;
}

const IV_TOLERANCE = 1;

function around(v: number): number[] {
  const out: number[] = [];
  for (let d = -IV_TOLERANCE; d <= IV_TOLERANCE; d++) if (v + d >= 0 && v + d <= 15) out.push(v + d);
  return out;
}

function ivCandidates(read: Ivs | null): Ivs[] {
  const range = (v: number | undefined) => (v === undefined ? [...Array(16).keys()] : around(v));
  const out: Ivs[] = [];
  for (const atk of range(read?.atk)) for (const def of range(read?.def)) for (const hp of range(read?.hp)) out.push({ atk, def, hp });
  return out;
}

function oneDigitOff(a: string, b: string): boolean {
  return a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;
}

/**
 * How well a candidate CP explains the noisy OCR reads: exact reads count most; partial reads
 * ("898" of 2898, or a truncated "37" of 3716) and one-digit misreads ("2876" for 2875) count a little.
 */
function support(cp: number, reads: number[]): number {
  const s = String(cp);
  return reads.reduce((acc, r) => {
    const t = String(r);
    if (r === cp) return acc + 3;
    if (t.length >= 3 && (s.includes(t) || oneDigitOff(s, t))) return acc + 1;
    if (t.length === 2 && s.startsWith(t)) return acc + 1;
    return acc;
  }, 0);
}

/**
 * Picks the (form, level, IVs) that is consistent with the in-game CP/HP formulas and best explains
 * the reads: HP max must match exactly, IVs may differ from the bar reading by at most 1, and CP is chosen
 * by agreement with the OCR reads. Leaves the record unchanged when nothing is consistent.
 */
export function solve(p: PokemonRecord, dex: Dex): PokemonRecord {
  const allForms = p.species ? dex.get(p.species.toUpperCase()) : undefined;
  if (!allForms || !p.hp) return { ...p, confidence: 'low' };
  // Types read on screen rule out forms (Alolan Marowak is fire/ghost, Marowak is ground).
  const seen = (p.types ?? []).map(t => t.toLowerCase());
  const typed = allForms.filter(f => seen.every(t => f.types.includes(t)));
  const forms = seen.length && typed.length ? typed : allForms;
  type Cand = { form: Form; level: number; ivs: Ivs; cp: number; score: number };
  const cands: Cand[] = [];
  for (const form of forms) {
    for (const { level, cpm } of LEVELS) {
      for (const ivs of ivCandidates(p.ivs)) {
        if (hpOf(form.baseStats, ivs, cpm) !== p.hp.max) continue;
        const cp = cpOf(form.baseStats, ivs, cpm);
        const ivDist = p.ivs ? Math.abs(ivs.atk - p.ivs.atk) + Math.abs(ivs.def - p.ivs.def) + Math.abs(ivs.hp - p.ivs.hp) : 0;
        cands.push({ form, level, ivs, cp, score: support(cp, p.cpReads) * 2 - ivDist * 3 });
      }
    }
  }
  if (!cands.length) return { ...p, confidence: 'low' };
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  // Without any CP evidence, only accept a unique answer among the exact-IV candidates.
  if (support(best.cp, p.cpReads) === 0) {
    const exact = cands.filter(c => c.score === best.score);
    if (new Set(exact.map(c => c.cp)).size !== 1) return { ...p, confidence: 'low' };
  }
  const ivsKept = !p.ivs || JSON.stringify(p.ivs) === JSON.stringify(best.ivs);
  const confidence = ivsKept && p.cpReads.includes(best.cp) ? 'high' : 'medium';
  // Forms with the same base stats give the same CP/HP: only the types on screen can tell them apart.
  const same = (f: Form) => JSON.stringify(f.baseStats) === JSON.stringify(best.form.baseStats);
  const formAlternatives = forms.filter(f => f !== best.form && same(f)).map(f => f.speciesId);
  return {
    ...p,
    cp: best.cp,
    ivs: best.ivs,
    speciesId: best.form.speciesId,
    level: best.level,
    confidence,
    ...(formAlternatives.length ? { formAlternatives } : {}),
  };
}

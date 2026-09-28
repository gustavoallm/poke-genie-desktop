import type { RankedPokemon } from './types.ts';

export type Readiness = 'ready' | 'candy' | 'xl';
export type Confidence = RankedPokemon['confidence'];

export interface Filters {
  search: string;
  types: string[];
  typeMatch: 'any' | 'all';
  ivRankMax: number | null;
  spMin: number | null;
  topN: number | null;
  cpMin: number | null;
  cpMax: number | null;
  bestCopy: boolean;
  readiness: 'all' | Readiness;
  /** Recommended moveset needs an elite/legacy move: any / hide those / only those. */
  elite: 'any' | 'hide' | 'only';
  /** Empty = any confidence. */
  confidence: Confidence[];
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  types: [],
  typeMatch: 'any',
  ivRankMax: null,
  spMin: null,
  topN: null,
  cpMin: null,
  cpMax: null,
  bestCopy: true,
  readiness: 'all',
  elite: 'any',
  confidence: [],
};

export const READINESS_LABEL: Record<Readiness, string> = { ready: 'Ready now', candy: 'Needs candy', xl: 'Needs XL' };
const XL_LEVEL = 40;

/** How much powering up it takes to reach the league cap: none, regular candy (≤ L40), or XL candy. */
export function readiness(p: RankedPokemon): Readiness | null {
  const target = p.iv50?.level;
  if (target == null || p.level == null) return null;
  if (p.level >= target) return 'ready';
  return target > XL_LEVEL ? 'xl' : 'candy';
}

/** pvpoke marks elite/legacy moves with "*": the mon may need an Elite TM to use this moveset. */
export function needsElite(p: RankedPokemon): boolean {
  const m = p.recommendedMoves;
  return !!m && [m.fast, ...m.charged].some(name => name.endsWith('*'));
}

export type SortKey = 'default' | 'pvp' | 'iv50' | 'sp' | 'cp' | 'iv51';
export interface Sort {
  key: SortKey;
  reversed: boolean;
}

const speciesKey = (p: RankedPokemon) => p.speciesId ?? `?${p.species}`;

/** Keeps the copy with the best (lowest) level-50 IV rank for each species, in the original order. */
export function bestCopyPerSpecies(list: RankedPokemon[]): RankedPokemon[] {
  const best = new Map<string, RankedPokemon>();
  for (const p of list) {
    const current = best.get(speciesKey(p));
    if (!current || (p.iv50?.rank ?? Infinity) < (current.iv50?.rank ?? Infinity)) best.set(speciesKey(p), p);
  }
  return list.filter(p => best.get(speciesKey(p)) === p);
}

function matches(p: RankedPokemon, f: Filters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && ![p.species, p.csvName, p.nickname].some(s => s?.toLowerCase().includes(q))) return false;
  if (f.types.length) {
    const own = p.types ?? [];
    const ok = f.typeMatch === 'all' ? f.types.every(t => own.includes(t)) : f.types.some(t => own.includes(t));
    if (!ok) return false;
  }
  if (f.ivRankMax !== null && !(p.iv50 && p.iv50.rank <= f.ivRankMax)) return false;
  if (f.spMin !== null && !(p.iv50 && p.iv50.statProductPct >= f.spMin)) return false;
  if (f.topN !== null && !(p.speciesRank !== undefined && p.speciesRank <= f.topN)) return false;
  if (f.cpMin !== null && !(p.cp !== null && p.cp >= f.cpMin)) return false;
  if (f.cpMax !== null && !(p.cp !== null && p.cp <= f.cpMax)) return false;
  if (f.readiness !== 'all' && readiness(p) !== f.readiness) return false;
  if (f.elite !== 'any' && needsElite(p) !== (f.elite === 'only')) return false;
  if (f.confidence.length && !f.confidence.includes(p.confidence)) return false;
  return true;
}

export function applyFilters(list: RankedPokemon[], f: Filters): RankedPokemon[] {
  const out = list.filter(p => matches(p, f));
  return f.bestCopy ? bestCopyPerSpecies(out) : out;
}

export interface FilterChip {
  id: string;
  label: string;
}

/** Filters that differ from the defaults, as removable chips (ids understood by clearFilter). */
export function activeFilterChips(f: Filters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.search.trim()) chips.push({ id: 'search', label: `“${f.search.trim()}”` });
  for (const t of f.types) chips.push({ id: `type:${t}`, label: t });
  if (f.ivRankMax !== null) chips.push({ id: 'ivRankMax', label: `IV rank ≤ ${f.ivRankMax}` });
  if (f.spMin !== null) chips.push({ id: 'spMin', label: `SP ≥ ${f.spMin}%` });
  if (f.topN !== null) chips.push({ id: 'topN', label: `pvpoke top ${f.topN}` });
  if (f.cpMin !== null || f.cpMax !== null) chips.push({ id: 'cp', label: `CP ${f.cpMin ?? 0}–${f.cpMax ?? '∞'}` });
  if (!f.bestCopy) chips.push({ id: 'bestCopy', label: 'All copies' }); // best copy per species is the default
  if (f.readiness !== 'all') chips.push({ id: 'readiness', label: READINESS_LABEL[f.readiness] });
  if (f.elite !== 'any') chips.push({ id: 'elite', label: f.elite === 'hide' ? 'No Elite TM needed' : 'Needs Elite TM' });
  if (f.confidence.length) chips.push({ id: 'confidence', label: `Confidence: ${f.confidence.join(', ')}` });
  return chips;
}

export function clearFilter(f: Filters, id: string): Filters {
  if (id.startsWith('type:')) return { ...f, types: f.types.filter(t => t !== id.slice('type:'.length)) };
  if (id === 'cp') return { ...f, cpMin: null, cpMax: null };
  if (id in DEFAULT_FILTERS) return { ...f, [id]: DEFAULT_FILTERS[id as keyof Filters] };
  return f;
}

/** Lower is better for every key, so each sorts in its natural direction; missing values are Infinity. */
const VALUE: Record<Exclude<SortKey, 'default'>, (p: RankedPokemon) => number> = {
  pvp: p => p.speciesRank ?? Infinity,
  iv50: p => p.iv50?.rank ?? Infinity,
  iv51: p => p.iv51?.rank ?? Infinity,
  sp: p => (p.iv50 ? -p.iv50.statProductPct : Infinity),
  cp: p => (p.cp !== null ? -p.cp : Infinity),
};

export function sortPokemon(list: RankedPokemon[], sort: Sort): RankedPokemon[] {
  if (sort.key === 'default') return sort.reversed ? [...list].reverse() : list;
  const value = VALUE[sort.key];
  return [...list].sort((a, b) => {
    const va = value(a),
      vb = value(b);
    if (va === vb) return 0;
    if (va === Infinity) return 1; // missing values stay last in both directions
    if (vb === Infinity) return -1;
    return sort.reversed ? vb - va : va - vb;
  });
}

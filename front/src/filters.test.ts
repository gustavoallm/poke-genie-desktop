import { describe, it, expect } from 'vitest';
import type { RankedPokemon } from './types.ts';
import {
  activeFilterChips,
  applyFilters,
  bestCopyPerSpecies,
  clearFilter,
  DEFAULT_FILTERS,
  needsElite,
  readiness,
  sortPokemon,
  type Filters,
} from './filters.ts';

const iv = (rank: number, pct: number, level = 30) => ({ rank, statProductPct: pct, level, cp: 2400, statProduct: 1 });
const mon = (p: Partial<RankedPokemon>): RankedPokemon => ({
  speciesId: 'x',
  species: 'X',
  nickname: null,
  cp: 2000,
  level: 30,
  ivs: { atk: 1, def: 1, hp: 1 },
  hpMax: 100,
  confidence: 'high',
  source: 's',
  firstTimeSec: 0,
  moves: null,
  ranked: true,
  ...p,
});
const moves = (charged1: string) => ({ fast: 'Metal Sound', charged: [charged1, 'Drill Peck'] as [string, string] });
const list = [
  mon({
    speciesId: 'cresselia',
    species: 'Cresselia',
    csvName: 'Cresselia',
    nickname: '.U 90',
    cp: 1600,
    level: 20,
    speciesRank: 35,
    types: ['psychic'],
    iv50: iv(3000, 94.5, 33),
    firstTimeSec: 1,
  }),
  mon({
    speciesId: 'cresselia',
    species: 'Cresselia',
    csvName: 'Cresselia',
    cp: 2457,
    level: 33,
    speciesRank: 35,
    types: ['psychic'],
    iv50: iv(1945, 96.1, 33),
    firstTimeSec: 2,
  }),
  mon({
    speciesId: 'empoleon',
    species: 'Empoleon',
    csvName: 'Empoleon',
    cp: 2496,
    level: 31.5,
    speciesRank: 8,
    types: ['water', 'steel'],
    iv50: iv(1130, 96.8, 31.5),
    confidence: 'medium',
    recommendedMoves: moves('Hydro Cannon*'),
    firstTimeSec: 3,
  }),
  mon({
    speciesId: 'steelix',
    species: 'Steelix',
    csvName: 'Steelix',
    cp: 2054,
    level: 31,
    speciesRank: 40,
    types: ['steel', 'ground'],
    iv50: iv(200, 98, 44.5),
    confidence: 'low',
    recommendedMoves: moves('Psychic Fangs'),
    firstTimeSec: 4,
  }),
];
/** Defaults with every copy shown, so each filter can be tested on its own. */
const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, bestCopy: false, ...patch });
const ids = (xs: RankedPokemon[]) => xs.map(p => p.firstTimeSec);

describe('applyFilters', () => {
  it('shows only the best copy of each species by default', () => {
    expect(DEFAULT_FILTERS.bestCopy).toBe(true);
    expect(ids(applyFilters(list, DEFAULT_FILTERS))).toEqual([2, 3, 4]);
    expect(applyFilters(list, f({}))).toHaveLength(4);
  });
  it('searches species, pvpoke name and nickname', () => {
    expect(ids(applyFilters(list, f({ search: 'u 90' })))).toEqual([1]);
    expect(ids(applyFilters(list, f({ search: 'emp' })))).toEqual([3]);
  });
  it('matches any or all selected types', () => {
    expect(ids(applyFilters(list, f({ types: ['steel', 'psychic'] })))).toEqual([1, 2, 3, 4]);
    expect(ids(applyFilters(list, f({ types: ['steel', 'water'], typeMatch: 'all' })))).toEqual([3]);
  });
  it('filters by IV rank, stat product, pvpoke top N and CP range', () => {
    expect(ids(applyFilters(list, f({ ivRankMax: 2000 })))).toEqual([2, 3, 4]);
    expect(ids(applyFilters(list, f({ spMin: 96.5 })))).toEqual([3, 4]);
    expect(ids(applyFilters(list, f({ topN: 35 })))).toEqual([1, 2, 3]);
    expect(ids(applyFilters(list, f({ cpMin: 2000, cpMax: 2460 })))).toEqual([2, 4]);
  });
  it('filters by readiness, elite moves and confidence', () => {
    expect(ids(applyFilters(list, f({ readiness: 'ready' })))).toEqual([2, 3]);
    expect(ids(applyFilters(list, f({ readiness: 'candy' })))).toEqual([1]);
    expect(ids(applyFilters(list, f({ readiness: 'xl' })))).toEqual([4]);
    expect(ids(applyFilters(list, f({ elite: 'hide' })))).toEqual([1, 2, 4]);
    expect(ids(applyFilters(list, f({ elite: 'only' })))).toEqual([3]);
    expect(ids(applyFilters(list, f({ confidence: ['medium', 'low'] })))).toEqual([3, 4]);
  });
  it('keeps only the best IV copy per species', () => {
    expect(ids(bestCopyPerSpecies(list))).toEqual([2, 3, 4]);
    expect(applyFilters(list, f({ bestCopy: true }))).toHaveLength(3);
  });
});

describe('readiness and needsElite', () => {
  it('classifies the power-up needed to reach the cap', () => {
    expect(readiness(list[1])).toBe('ready');
    expect(readiness(list[0])).toBe('candy');
    expect(readiness(list[3])).toBe('xl');
    expect(readiness(mon({ iv50: undefined }))).toBeNull();
  });
  it('flags recommended movesets with an elite/legacy move', () => {
    expect(needsElite(list[2])).toBe(true);
    expect(needsElite(list[3])).toBe(false);
  });
});

describe('activeFilterChips / clearFilter', () => {
  it('lists active filters as removable chips', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      search: 'emp',
      types: ['water', 'steel'],
      ivRankMax: 500,
      readiness: 'ready' as const,
      confidence: ['high' as const],
    };
    const chips = activeFilterChips(filters);
    expect(chips.map(c => c.label)).toEqual(['“emp”', 'water', 'steel', 'IV rank ≤ 500', 'Ready now', 'Confidence: high']);
    const noWater = clearFilter(filters, chips[1].id);
    expect(noWater.types).toEqual(['steel']);
    expect(clearFilter(filters, 'ivRankMax').ivRankMax).toBeNull();
    expect(activeFilterChips(DEFAULT_FILTERS)).toEqual([]);
  });
  it('shows turning best copy off as an "All copies" chip that restores the default', () => {
    const all = { ...DEFAULT_FILTERS, bestCopy: false };
    expect(activeFilterChips(all)).toEqual([{ id: 'bestCopy', label: 'All copies' }]);
    expect(clearFilter(all, 'bestCopy').bestCopy).toBe(true);
  });
});

describe('sortPokemon', () => {
  it('keeps file order by default and reverses it when asked', () => {
    expect(sortPokemon(list, { key: 'default', reversed: false })).toEqual(list);
    expect(sortPokemon(list, { key: 'default', reversed: true })[0]).toBe(list[3]);
  });
  it('sorts each key in its natural direction with missing values last', () => {
    expect(sortPokemon(list, { key: 'pvp', reversed: false }).map(p => p.speciesRank)).toEqual([8, 35, 35, 40]);
    expect(ids(sortPokemon(list, { key: 'sp', reversed: false }))).toEqual([4, 3, 2, 1]);
    expect(ids(sortPokemon(list, { key: 'cp', reversed: false }))).toEqual([3, 2, 4, 1]);
    expect(ids(sortPokemon(list, { key: 'iv50', reversed: true }))).toEqual([1, 2, 3, 4]);
  });
});

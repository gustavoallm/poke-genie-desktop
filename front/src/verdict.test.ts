import { describe, it, expect } from 'vitest';
import type { InventoryPokemon, LeagueEval } from './types.ts';
import { DEFAULT_RULE, transferGroups, verdict } from './verdict.ts';

const ineligible: LeagueEval = { eligible: false, ranked: false };
const league = (speciesRank: number, position: number, of: number, rank = 100): LeagueEval => ({
  eligible: true,
  ranked: true,
  speciesRank,
  speciesScore: 90,
  copy: { position, of },
  iv50: { rank, statProductPct: 95, level: 30, cp: 2400, statProduct: 1 },
});
const mon = (key: string, leagues: Partial<InventoryPokemon['leagues']>, extra: Partial<InventoryPokemon> = {}): InventoryPokemon => ({
  key,
  source: 's',
  firstTimeSec: 0,
  speciesId: 'cresselia',
  species: 'Cresselia',
  name: 'Cresselia',
  nickname: null,
  cp: 1600,
  level: 30,
  ivs: { atk: 11, def: 15, hp: 12 },
  hpMax: 150,
  confidence: 'high',
  moves: null,
  leagues: { great: ineligible, ultra: ineligible, master: ineligible, ...leagues },
  ...extra,
});

describe('verdict', () => {
  it('keeps a top copy of a top species, listing the leagues', () => {
    const v = verdict(mon('a', { ultra: league(35, 1, 17), master: league(80, 2, 17) }), DEFAULT_RULE);
    expect(v).toMatchObject({ kind: 'keep', keep: ['ultra', 'master'] });
  });
  it('transfers a surplus copy and says which copy it is', () => {
    const v = verdict(mon('b', { ultra: league(35, 9, 17) }), DEFAULT_RULE);
    expect(v.kind).toBe('transfer');
    expect(v.reason).toBe('9th-best of your 17 Cresselia for Ultra League (keeping the top 2)');
  });
  it('transfers a species that is not in the top K of any league it can play', () => {
    const v = verdict(mon('c', { great: league(480, 1, 1) }, { name: 'Illumise', speciesId: 'illumise' }), DEFAULT_RULE);
    expect(v).toMatchObject({ kind: 'transfer', reason: "Not in pvpoke's top 100 for any league it can play" });
  });
  it('asks for a manual check when the species or the reading is uncertain', () => {
    expect(verdict(mon('d', {}, { speciesId: null }), DEFAULT_RULE).kind).toBe('check');
    expect(verdict(mon('e', { ultra: league(35, 9, 17) }, { confidence: 'low' }), DEFAULT_RULE).kind).toBe('check');
  });
  it('follows the adjustable rule', () => {
    const p = mon('f', { ultra: league(35, 3, 17) });
    expect(verdict(p, DEFAULT_RULE).kind).toBe('transfer');
    expect(verdict(p, { keepCopies: 3, topSpecies: 100 }).kind).toBe('keep');
    expect(verdict(mon('g', { ultra: league(120, 1, 1) }), { keepCopies: 2, topSpecies: 150 }).kind).toBe('keep');
  });
});

describe('transferGroups', () => {
  it('groups transfer suggestions by species, most copies first', () => {
    const inv = [
      mon('a', { ultra: league(35, 1, 3) }),
      mon('b', { ultra: league(35, 3, 3) }),
      mon('c', { ultra: league(35, 4, 3) }),
      mon('d', { great: league(480, 1, 1) }, { name: 'Illumise', speciesId: 'illumise' }),
    ];
    const groups = transferGroups(inv, DEFAULT_RULE);
    expect(groups.map(g => [g.name, g.transfer.map(t => t.pokemon.key), g.owned])).toEqual([
      ['Cresselia', ['b', 'c'], 3],
      ['Illumise', ['d'], 1],
    ]);
  });
});

describe('verdict with evolutions', () => {
  const evo = (leagues: Partial<InventoryPokemon['leagues']>) => ({
    speciesId: 'skeledirge',
    name: 'Skeledirge',
    key: 's>skeledirge@1',
    cpNow: 2347,
    leagues: { great: ineligible, ultra: ineligible, master: ineligible, ...leagues },
  });
  it('keeps a pre-evolution whose evolution is worth keeping', () => {
    const p = mon('fue', {}, { speciesId: 'fuecoco', name: 'Fuecoco', evolutions: [evo({ ultra: league(20, 1, 2) })] });
    expect(verdict(p, DEFAULT_RULE)).toMatchObject({ kind: 'keep', keep: ['ultra'], reason: 'evolve into Skeledirge: best for UL (#20)' });
  });
  it('still suggests transferring a pre-evolution whose evolution is a surplus copy', () => {
    const p = mon('fue', {}, { speciesId: 'fuecoco', name: 'Fuecoco', evolutions: [evo({ ultra: league(20, 4, 4) })] });
    expect(verdict(p, DEFAULT_RULE)).toMatchObject({
      kind: 'transfer',
      reason: '4th-best of your 4 Skeledirge for Ultra League, once evolved (keeping the top 2)',
    });
  });
});

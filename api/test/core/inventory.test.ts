import { describe, it, expect } from 'vitest';
import { loadGamemaster } from '../../src/core/gamemaster.ts';
import { buildInventory, rankedForLeague, type PvpokeRankings } from '../../src/core/inventory.ts';
import type { ExtractedMon } from '../../src/core/rank.ts';

const gm = loadGamemaster();
const entries = (ids: string[]) =>
  ids.map((speciesId, i) => ({
    speciesId,
    score: 95 - i,
    moveset: speciesId === 'empoleon' ? ['METAL_SOUND', 'HYDRO_CANNON', 'DRILL_PECK'] : ['MUD_SHOT', 'ROCK_SLIDE', 'EARTHQUAKE'],
  }));
const rankings: PvpokeRankings = {
  great: entries(['stunfisk_galarian', 'empoleon', 'stunfisk']),
  ultra: entries(['empoleon', 'stunfisk_galarian']),
  master: entries(['empoleon']),
};
const mon = (p: Partial<ExtractedMon>): ExtractedMon => ({
  cp: 1400,
  speciesId: 'empoleon',
  species: 'Empoleon',
  nickname: null,
  ivs: { atk: 5, def: 15, hp: 15 },
  hp: { current: 130, max: 130 },
  level: 20,
  confidence: 'high',
  firstTimeSec: 1,
  ...p,
});

describe('buildInventory', () => {
  const inputs = [
    {
      source: 'a.json',
      pokemon: [
        mon({ firstTimeSec: 1 }),
        mon({ firstTimeSec: 2, cp: 2400, ivs: { atk: 15, def: 15, hp: 15 }, level: 30 }),
        mon({
          firstTimeSec: 3,
          speciesId: 'stunfisk',
          species: 'Stunfisk',
          cp: 1491,
          ivs: { atk: 14, def: 14, hp: 12 },
          formAlternatives: ['stunfisk_galarian'],
        }),
      ],
    },
    { source: 'b.json', pokemon: [mon({ firstTimeSec: 9, confidence: 'medium' })] }, // same Empoleon seen in another video
  ];

  it('merges the same Pokémon seen in several videos, keeping the most confident record', () => {
    const inv = buildInventory(inputs, gm, rankings, {});
    expect(inv).toHaveLength(3);
    expect(inv.find(p => p.cp === 1400 && p.speciesId === 'empoleon')!.key).toBe('a.json@1');
  });
  it('evaluates every league: eligibility, species rank, IV rank and copy position', () => {
    const inv = buildInventory(inputs, gm, rankings, {});
    const small = inv.find(p => p.key === 'a.json@1')!;
    const big = inv.find(p => p.key === 'a.json@2')!;
    expect(small.leagues.great).toMatchObject({ eligible: true, speciesRank: 2 });
    expect(big.leagues.great.eligible).toBe(false);
    expect(big.leagues.ultra).toMatchObject({ eligible: true, speciesRank: 1 });
    expect(small.leagues.ultra.iv50!.rank).toBeLessThan(big.leagues.ultra.iv50!.rank); // low attack is better under a cap
    expect(small.leagues.ultra.copy).toEqual({ position: 1, of: 2 });
    expect(big.leagues.ultra.copy).toEqual({ position: 2, of: 2 });
    expect(big.leagues.master.copy).toEqual({ position: 1, of: 2 }); // 15/15/15 is best without a cap
  });
  it('tags legendary, mythical and ultra beast species so transfers can warn about them', () => {
    const inv = buildInventory(
      [
        {
          source: 'a.json',
          pokemon: [
            mon({ firstTimeSec: 1, speciesId: 'cresselia', species: 'Cresselia' }),
            mon({ firstTimeSec: 2, speciesId: 'darkrai', species: 'Darkrai' }),
            mon({ firstTimeSec: 3 }),
          ],
        },
      ],
      gm,
      rankings,
      {},
    );
    expect(inv.map(p => p.rarity)).toEqual(['legendary', 'mythical', undefined]);
  });
  it('applies a form override only to a form the video could not rule out', () => {
    const ok = buildInventory(inputs, gm, rankings, { 'a.json@3': 'stunfisk_galarian' }).find(p => p.key === 'a.json@3')!;
    expect(ok).toMatchObject({ speciesId: 'stunfisk_galarian', overridden: true });
    expect(ok.formAlternatives).toEqual(['stunfisk']);
    expect(ok.leagues.great.speciesRank).toBe(1);
    const bad = buildInventory(inputs, gm, rankings, { 'a.json@3': 'empoleon' }).find(p => p.key === 'a.json@3')!;
    expect(bad.speciesId).toBe('stunfisk');
  });
});

describe('rankedForLeague', () => {
  it('builds the per-league ranking from the inventory, eligible Pokémon only, with pvpoke moves', () => {
    const inv = buildInventory(
      [{ source: 'a.json', pokemon: [mon({ firstTimeSec: 1 }), mon({ firstTimeSec: 2, cp: 2400 })] }],
      gm,
      rankings,
      {},
    );
    const great = rankedForLeague(inv, 'great');
    expect(great).toMatchObject({ league: 'great', cap: 1500, csv: 'pvpoke' });
    expect(great.pokemon.map(p => p.firstTimeSec)).toEqual([1]);
    expect(great.pokemon[0].recommendedMoves).toEqual({ fast: 'Metal Sound', charged: ['Hydro Cannon*', 'Drill Peck'] });
  });
});

describe('evolutions', () => {
  const evoRankings: PvpokeRankings = {
    great: entries(['skeledirge']),
    ultra: entries(['skeledirge']),
    master: entries(['skeledirge']),
  };
  const inv = buildInventory(
    [
      {
        source: 'shots.json',
        pokemon: [
          mon({ firstTimeSec: 1, speciesId: 'fuecoco', species: 'Fuecoco', cp: 833, level: 29, ivs: { atk: 4, def: 13, hp: 10 } }),
          mon({ firstTimeSec: 2, speciesId: 'skeledirge', species: 'Skeledirge', cp: 1651, level: 21, ivs: { atk: 3, def: 4, hp: 10 } }),
        ],
      },
    ],
    gm,
    evoRankings,
    {},
  );
  const fuecoco = inv.find(p => p.speciesId === 'fuecoco')!;

  it('evaluates a pre-evolution as its final evolution at its current level, same IVs', () => {
    expect(fuecoco.evolutions).toHaveLength(1);
    const evo = fuecoco.evolutions![0];
    expect(evo).toMatchObject({ speciesId: 'skeledirge', name: 'Skeledirge', cpNow: 2347 });
    expect(evo.leagues.great.eligible).toBe(false); // evolving pushes it past 1500
    expect(evo.leagues.ultra).toMatchObject({ eligible: true, ranked: true, speciesRank: 1 });
  });
  it('counts evolution candidates among your copies of the evolved species', () => {
    const evo = fuecoco.evolutions![0];
    const real = inv.find(p => p.speciesId === 'skeledirge')!;
    expect(evo.leagues.ultra.copy).toEqual({ position: 1, of: 2 });
    expect(real.leagues.ultra.copy).toEqual({ position: 2, of: 2 });
  });
  it('lists evolution candidates in the league ranking, pointing back to the Pokémon to evolve', () => {
    const ultra = rankedForLeague(inv, 'ultra');
    const row = ultra.pokemon.find(p => p.evolvesFrom)!;
    expect(row).toMatchObject({ speciesId: 'skeledirge', cp: 2347, evolvesFrom: { key: 'shots.json@1', name: 'Fuecoco' } });
  });
});

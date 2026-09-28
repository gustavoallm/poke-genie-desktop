import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInventoryStore } from '../../src/core/inventoryStore.ts';
import type { ExtractedMon } from '../../src/core/rank.ts';

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

let outDir: string;
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgd-inv-'));
  const extractions = path.join(outDir, 'extractions');
  fs.mkdirSync(extractions);
  fs.writeFileSync(
    path.join(extractions, 'great.json'),
    JSON.stringify({
      source: 'great.mp4',
      pokemon: [
        mon({ firstTimeSec: 1 }),
        mon({
          firstTimeSec: 2,
          speciesId: 'stunfisk',
          species: 'Stunfisk',
          cp: 1491,
          ivs: { atk: 14, def: 14, hp: 12 },
          formAlternatives: ['stunfisk_galarian'],
        }),
      ],
      bag: [],
    }),
  );
  fs.writeFileSync(
    path.join(extractions, 'ultra.json'),
    JSON.stringify({ source: 'ultra.mp4', pokemon: [mon({ firstTimeSec: 5, cp: 2400 })], bag: [] }),
  );
  fs.writeFileSync(path.join(extractions, 'notes.json'), JSON.stringify({ hello: 'not an extraction' }));
  fs.mkdirSync(path.join(extractions, 'old'));
});

describe('inventory store', () => {
  it('reads every extraction output in out/extractions/, keyed by file name', () => {
    const store = createInventoryStore({ outDir });
    expect(
      store
        .inventory()
        .map(p => p.key)
        .sort(),
    ).toEqual(['great.json@1', 'great.json@2', 'ultra.json@5']);
    expect(store.leagues()).toEqual(['great', 'ultra', 'master']);
    expect(
      store
        .ranked('great')!
        .pokemon.map(p => p.firstTimeSec)
        .sort(),
    ).toEqual([1, 2]);
  });
  it('saves a valid form override and applies it', () => {
    const store = createInventoryStore({ outDir });
    store.setOverride('great.json@2', 'stunfisk_galarian');
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'overrides.json'), 'utf8'))).toEqual({ 'great.json@2': 'stunfisk_galarian' });
    expect(store.inventory().find(p => p.key === 'great.json@2')).toMatchObject({ speciesId: 'stunfisk_galarian', overridden: true });
    store.setOverride('great.json@2', null);
    expect(store.inventory().find(p => p.key === 'great.json@2')!.speciesId).toBe('stunfisk');
  });
  it('rejects overrides to a form that does not fit, or unknown Pokémon', () => {
    const store = createInventoryStore({ outDir });
    expect(() => store.setOverride('great.json@2', 'empoleon')).toThrow(/form/);
    expect(() => store.setOverride('nope@1', 'stunfisk_galarian')).toThrow(/Unknown/);
  });
});

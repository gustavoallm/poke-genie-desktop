# League Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank extracted Pokémon for a league: pvpoke species rank/score plus IV stat-product rank (level 50 and 51), written to `out/ranked/<league>.json`.

**Architecture:** Pure TS modules in `src/core/` (CP formulas, gamemaster loader, pvpoke CSV parser, IV ranker, collection ranker) reused later by the React UI; a thin CLI in `src/rank-cli.ts`. `poc/` imports the shared CP formulas from `src/core/cp.ts`.

**Tech Stack:** Node 24, TypeScript via tsx, vitest. No new dependencies.

## Global Constraints

- Leagues: `great` cap 1500, `ultra` cap 2500, `master` no cap.
- IV rank at maxLevel 50 (primary) and 51 (best buddy).
- Default order: species score desc, then level-50 IV rank asc; unranked mons after ranked ones; CP above cap excluded.
- Every mon is matched as non-shadow (shadow detection is out of scope).
- Spec: `docs/superpowers/specs/2026-09-27-league-ranking-design.md`.

## File Structure

| File                     | Responsibility                                                          |
| ------------------------ | ----------------------------------------------------------------------- |
| `src/core/types.ts`      | `Ivs` (shared with poc)                                                 |
| `src/core/cp.ts`         | CPM table, `cpOf`, `hpOf`, `consistentIvs` (moved from `poc/src/cp.ts`) |
| `src/core/gamemaster.ts` | Load pvpoke gamemaster: species list, name→id and id→base stats maps    |
| `src/core/rankings.ts`   | Parse pvpoke rankings CSV into `Map<speciesId, SpeciesRanking>`         |
| `src/core/ivrank.ts`     | Leagues, best level under cap, stat product, cached 1..4096 rank        |
| `src/core/rank.ts`       | Extraction records → sorted `RankedPokemon[]`                           |
| `src/rank-cli.ts`        | CLI → `out/ranked/<league>.json` + top-N table                          |
| `src/test/*.test.ts`     | vitest tests                                                            |

---

### Task 1: Move CP formulas to `src/core`, add gamemaster loader

**Files:** Create `src/core/types.ts`, `src/core/cp.ts` (moved), `src/core/gamemaster.ts`; modify `poc/src/types.ts`, `poc/src/solve.ts`, `poc/test/cp.test.ts`, `tsconfig.json`; delete `poc/src/cp.ts`; test `src/test/gamemaster.test.ts`.

**Produces:** `Ivs`; `LEVELS`, `cpOf`, `hpOf`, `consistentIvs`, `BaseStats` (unchanged signatures); `loadGamemaster(file?: string): Gamemaster` with
`interface GmPokemon { speciesId: string; speciesName: string; dex: number; types: string[]; baseStats: BaseStats }` and
`interface Gamemaster { pokemon: GmPokemon[]; idByName: Map<string, string>; statsById: Map<string, BaseStats> }`.

- [ ] Step 1: failing test `src/test/gamemaster.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadGamemaster } from '../core/gamemaster.ts';

describe('loadGamemaster', () => {
  const gm = loadGamemaster();
  it('maps pvpoke display names to species ids, including forms and shadows', () => {
    expect(gm.idByName.get('Palkia (Origin)')).toBe('palkia_origin');
    expect(gm.idByName.get('Snorlax (Shadow)')).toBe('snorlax_shadow');
  });
  it('maps species ids to base stats', () => {
    expect(gm.statsById.get('salamence')).toEqual({ atk: 277, def: 168, hp: 216 });
  });
});
```

- [ ] Step 2: `npx vitest run src/test/gamemaster.test.ts` → FAIL (module missing).
- [ ] Step 3: move `poc/src/cp.ts` → `src/core/cp.ts` (`git mv`), change its import to `import type { Ivs } from './types.ts';`. Create `src/core/types.ts`:

```ts
export interface Ivs {
  atk: number;
  def: number;
  hp: number;
}
```

In `poc/src/types.ts` replace the `Ivs` interface with `export type { Ivs } from '../../src/core/types.ts';` and add `import type { Ivs } from '../../src/core/types.ts';` for local use. In `poc/src/solve.ts` import from `'../../src/core/cp.ts'`; in `poc/test/cp.test.ts` import from `'../../src/core/cp.ts'`. `tsconfig.json` include `["poc", "src"]`.
Create `src/core/gamemaster.ts`:

```ts
import fs from 'node:fs';
import type { BaseStats } from './cp.ts';

export interface GmPokemon {
  speciesId: string;
  speciesName: string;
  dex: number;
  types: string[];
  baseStats: BaseStats;
}
export interface Gamemaster {
  pokemon: GmPokemon[];
  idByName: Map<string, string>;
  statsById: Map<string, BaseStats>;
}

export function loadGamemaster(file = 'data/gamemaster.json'): Gamemaster {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { pokemon: GmPokemon[] };
  const pokemon = raw.pokemon.map(p => ({
    speciesId: p.speciesId,
    speciesName: p.speciesName,
    dex: p.dex,
    types: p.types,
    baseStats: p.baseStats,
  }));
  return {
    pokemon,
    idByName: new Map(pokemon.map(p => [p.speciesName, p.speciesId])),
    statsById: new Map(pokemon.map(p => [p.speciesId, p.baseStats])),
  };
}
```

- [ ] Step 4: `npx vitest run` → all pass; `npx tsc --noEmit` clean; `npm run score` still `GATE: PASS` (after `npm run regroup -- iv-screenshot video-only-iv video-attack-plus-iv`).
- [ ] Step 5: commit `refactor: share CP formulas from src/core and add gamemaster loader`.

---

### Task 2: pvpoke rankings CSV parser

**Files:** Create `src/core/rankings.ts`; test `src/test/rankings.test.ts`.

**Produces:**

```ts
interface SpeciesRanking {
  rank: number;
  score: number;
  csvName: string;
  speciesId: string;
  dex: number;
  types: string[];
  moves: { fast: string; charged: [string, string] };
}
function parseRankingsCsv(csv: string, idByName: Map<string, string>): Map<string, SpeciesRanking>;
```

- [ ] Step 1: failing test

```ts
import { describe, it, expect } from 'vitest';
import { parseRankingsCsv } from '../core/rankings.ts';

const CSV = `Pokemon,Score,Dex,Type 1,Type 2,Attack,Defense,Stamina,Stat Product,Level,CP,Fast Move,Charged Move 1,Charged Move 2,Charged Move 1 Count,Charged Move 2 Count,Buddy Distance,Charged Move Cost
Tinkaton,94.4,959,fairy,steel,140.3,177.3,178,4428816,50,2499,Fairy Wind,Gigaton Hammer*,Bulldoze,7,7,3,75000
Snorlax (Shadow),93.7,143,normal,none,139.1,131.2,245,4470989,28.5,2495,Psywave,Body Slam,Earthquake,10,17,5,75000
Unknownmon,50,999,normal,none,1,1,1,1,1,10,Tackle,Struggle,Struggle,1,1,1,1
`;
const ids = new Map([
  ['Tinkaton', 'tinkaton'],
  ['Snorlax (Shadow)', 'snorlax_shadow'],
]);

describe('parseRankingsCsv', () => {
  const r = parseRankingsCsv(CSV, ids);
  it('keeps the CSV order as rank and parses fields', () => {
    expect(r.get('tinkaton')).toEqual({
      rank: 1,
      score: 94.4,
      csvName: 'Tinkaton',
      speciesId: 'tinkaton',
      dex: 959,
      types: ['fairy', 'steel'],
      moves: { fast: 'Fairy Wind', charged: ['Gigaton Hammer*', 'Bulldoze'] },
    });
    expect(r.get('snorlax_shadow')).toMatchObject({ rank: 2, types: ['normal'] });
  });
  it('skips rows whose name is not in the gamemaster', () => {
    expect(r.size).toBe(2);
  });
});
```

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement

```ts
export interface SpeciesRanking {
  rank: number;
  score: number;
  csvName: string;
  speciesId: string;
  dex: number;
  types: string[];
  moves: { fast: string; charged: [string, string] };
}

/** pvpoke "all overall rankings" CSV: rows are already sorted best-first; names contain no commas. */
export function parseRankingsCsv(csv: string, idByName: Map<string, string>): Map<string, SpeciesRanking> {
  const out = new Map<string, SpeciesRanking>();
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(l => l.split(','));
  rows.forEach((c, i) => {
    const speciesId = idByName.get(c[0]);
    if (!speciesId) return;
    out.set(speciesId, {
      rank: i + 1,
      score: Number(c[1]),
      csvName: c[0],
      speciesId,
      dex: Number(c[2]),
      types: [c[3], c[4]].filter(t => t && t !== 'none'),
      moves: { fast: c[11], charged: [c[12], c[13]] },
    });
  });
  return out;
}
```

- [ ] Step 4: run → PASS. Step 5: commit `feat: parse pvpoke rankings CSV`.

---

### Task 3: IV ranker

**Files:** Create `src/core/ivrank.ts`; test `src/test/ivrank.test.ts`.

**Produces:**

```ts
type League = 'great' | 'ultra' | 'master';
const LEAGUE_CAPS: Record<League, number>; // master = Infinity
interface SpreadStats {
  level: number;
  cp: number;
  statProduct: number;
}
interface IvRankResult extends SpreadStats {
  rank: number;
  statProductPct: number;
}
function bestUnderCap(base: BaseStats, ivs: Ivs, cap: number, maxLevel: number): SpreadStats | null;
function createIvRanker(cap: number, maxLevel: number): (speciesId: string, base: BaseStats, ivs: Ivs) => IvRankResult | null;
```

- [ ] Step 1: failing test

```ts
import { describe, it, expect } from 'vitest';
import { bestUnderCap, createIvRanker, LEAGUE_CAPS } from '../core/ivrank.ts';
import { loadGamemaster } from '../core/gamemaster.ts';

const gm = loadGamemaster();
const stats = (id: string) => gm.statsById.get(id)!;

describe('bestUnderCap', () => {
  it('reproduces pvpoke CSV rows (default IVs from the gamemaster)', () => {
    const tink = bestUnderCap(stats('tinkaton'), { atk: 12, def: 15, hp: 15 }, 2500, 50)!;
    expect(tink).toMatchObject({ level: 50, cp: 2499 });
    expect(Math.abs(tink.statProduct - 4428816)).toBeLessThan(2);
    expect(bestUnderCap(stats('corviknight'), { atk: 4, def: 14, hp: 13 }, 2500, 50)).toMatchObject({ level: 47, cp: 2497 });
  });
  it('stops at maxLevel when the cap is out of reach', () => {
    expect(bestUnderCap(stats('magikarp'), { atk: 15, def: 15, hp: 15 }, 2500, 50)!.level).toBe(50);
    expect(bestUnderCap(stats('magikarp'), { atk: 15, def: 15, hp: 15 }, 2500, 51)!.level).toBe(51);
  });
  it('uses maxLevel with no cap (master league)', () => {
    expect(bestUnderCap(stats('dialga'), { atk: 15, def: 15, hp: 15 }, LEAGUE_CAPS.master, 50)!.level).toBe(50);
  });
});

describe('createIvRanker', () => {
  const rank = createIvRanker(2500, 50);
  it('ranks 1..4096 with the best spread at 100%', () => {
    const base = stats('empoleon');
    const all = [];
    for (let a = 0; a < 16; a++)
      for (let d = 0; d < 16; d++) for (let h = 0; h < 16; h++) all.push(rank('empoleon', base, { atk: a, def: d, hp: h })!);
    const best = all.find(r => r.rank === 1)!;
    expect(best.statProductPct).toBeCloseTo(100, 6);
    expect(Math.max(...all.map(r => r.rank))).toBeLessThanOrEqual(4096);
    expect(Math.min(...all.map(r => r.statProductPct))).toBeGreaterThan(0);
  });
  it('ranks a low-attack high-bulk spread above a 15/15/15 in a capped league', () => {
    const base = stats('empoleon');
    expect(rank('empoleon', base, { atk: 0, def: 15, hp: 15 })!.rank).toBeLessThan(
      rank('empoleon', base, { atk: 15, def: 15, hp: 15 })!.rank,
    );
  });
});
```

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement

```ts
import { LEVELS, cpOf, type BaseStats } from './cp.ts';
import type { Ivs } from './types.ts';

export type League = 'great' | 'ultra' | 'master';
export const LEAGUE_CAPS: Record<League, number> = { great: 1500, ultra: 2500, master: Infinity };

export interface SpreadStats {
  level: number;
  cp: number;
  statProduct: number;
}
export interface IvRankResult extends SpreadStats {
  rank: number;
  statProductPct: number;
}

/** Highest level up to maxLevel whose CP stays within the cap, and the stat product there. */
export function bestUnderCap(base: BaseStats, ivs: Ivs, cap: number, maxLevel: number): SpreadStats | null {
  let best: SpreadStats | null = null;
  for (const { level, cpm } of LEVELS) {
    if (level > maxLevel) break;
    const cp = cpOf(base, ivs, cpm);
    if (cp > cap) break; // CP only grows with level
    const statProduct = (base.atk + ivs.atk) * cpm * (base.def + ivs.def) * cpm * Math.floor((base.hp + ivs.hp) * cpm);
    best = { level, cp, statProduct };
  }
  return best;
}

/** Ranks a spread among all 4096 for its species; the per-species table is computed once and cached. */
export function createIvRanker(cap: number, maxLevel: number) {
  const tables = new Map<string, { products: number[]; best: number }>();
  const table = (speciesId: string, base: BaseStats) => {
    let t = tables.get(speciesId);
    if (!t) {
      const products: number[] = [];
      for (let atk = 0; atk < 16; atk++)
        for (let def = 0; def < 16; def++)
          for (let hp = 0; hp < 16; hp++) {
            const s = bestUnderCap(base, { atk, def, hp }, cap, maxLevel);
            if (s) products.push(s.statProduct);
          }
      t = { products, best: Math.max(...products) };
      tables.set(speciesId, t);
    }
    return t;
  };
  return (speciesId: string, base: BaseStats, ivs: Ivs): IvRankResult | null => {
    const own = bestUnderCap(base, ivs, cap, maxLevel);
    if (!own) return null;
    const t = table(speciesId, base);
    const rank = 1 + t.products.filter(p => p > own.statProduct).length;
    return { ...own, rank, statProductPct: (own.statProduct / t.best) * 100 };
  };
}
```

- [ ] Step 4: run → PASS. Step 5: commit `feat: IV stat-product rank per league`.

---

### Task 4: Collection ranker

**Files:** Create `src/core/rank.ts`; test `src/test/rank.test.ts`.

**Consumes:** `SpeciesRanking`, `createIvRanker`, `LEAGUE_CAPS`, `Gamemaster`.
**Produces:**

```ts
interface ExtractedMon { cp: number | null; speciesId?: string; species: string | null; nickname: string | null;
  ivs: Ivs | null; hp: { current: number; max: number } | null; level?: number; confidence?: 'high' | 'medium' | 'low'; firstTimeSec: number }
interface RankedPokemon { ...as in spec... }
function rankCollection(inputs: Array<{ source: string; pokemon: ExtractedMon[] }>, league: League,
  rankings: Map<string, SpeciesRanking>, statsById: Map<string, BaseStats>): RankedPokemon[]
```

- [ ] Step 1: failing test

```ts
import { describe, it, expect } from 'vitest';
import { rankCollection, type ExtractedMon } from '../core/rank.ts';
import type { SpeciesRanking } from '../core/rankings.ts';
import { loadGamemaster } from '../core/gamemaster.ts';

const gm = loadGamemaster();
const ranking = (speciesId: string, rank: number, score: number): SpeciesRanking => ({
  rank,
  score,
  csvName: speciesId,
  speciesId,
  dex: 1,
  types: ['water'],
  moves: { fast: 'A', charged: ['B', 'C'] },
});
const rankings = new Map([
  ['empoleon', ranking('empoleon', 8, 92.1)],
  ['lapras', ranking('lapras', 22, 90.5)],
]);
const mon = (p: Partial<ExtractedMon>): ExtractedMon => ({
  cp: 2000,
  species: null,
  nickname: null,
  ivs: { atk: 10, def: 10, hp: 10 },
  hp: { current: 150, max: 150 },
  confidence: 'high',
  firstTimeSec: 0,
  ...p,
});

describe('rankCollection', () => {
  const out = rankCollection(
    [
      {
        source: 'v.mp4',
        pokemon: [
          mon({ speciesId: 'lapras', species: 'Lapras', cp: 1967 }),
          mon({ speciesId: 'empoleon', species: 'Empoleon', cp: 2496, ivs: { atk: 15, def: 15, hp: 15 } }),
          mon({ speciesId: 'empoleon', species: 'Empoleon', cp: 2400, ivs: { atk: 0, def: 15, hp: 15 } }),
          mon({ speciesId: 'roselia', species: 'Roselia', cp: 1590 }),
          mon({ species: 'Mewtwo', cp: 1761 }),
          mon({ speciesId: 'lapras', species: 'Lapras', cp: 2600 }),
        ],
      },
    ],
    'ultra',
    rankings,
    gm.statsById,
  );

  it('orders by species score, then IV rank, with unranked last and over-cap excluded', () => {
    expect(out.map(p => [p.speciesId, p.ivs?.atk])).toEqual([
      ['empoleon', 0],
      ['empoleon', 15],
      ['lapras', 10],
      [null, 10],
      ['roselia', 10],
    ]);
  });
  it('fills league fields and IV ranks at level 50 and 51', () => {
    expect(out[0]).toMatchObject({ ranked: true, speciesRank: 8, speciesScore: 92.1, source: 'v.mp4' });
    expect(out[0].iv50!.rank).toBeLessThan(out[1].iv50!.rank);
    expect(out[0].iv51!.level).toBeGreaterThan(0);
  });
  it('explains why a mon is unranked', () => {
    expect(out.find(p => p.speciesId === 'roselia')).toMatchObject({ ranked: false, unrankedReason: 'not-in-rankings' });
    expect(out.find(p => p.species === 'Mewtwo')).toMatchObject({ ranked: false, unrankedReason: 'no-species' });
  });
});
```

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement

```ts
import type { BaseStats } from './cp.ts';
import type { Ivs } from './types.ts';
import type { SpeciesRanking } from './rankings.ts';
import { createIvRanker, LEAGUE_CAPS, type IvRankResult, type League } from './ivrank.ts';

export interface ExtractedMon {
  cp: number | null;
  speciesId?: string;
  species: string | null;
  nickname: string | null;
  ivs: Ivs | null;
  hp: { current: number; max: number } | null;
  level?: number;
  confidence?: 'high' | 'medium' | 'low';
  firstTimeSec: number;
}

export interface RankedPokemon {
  speciesId: string | null;
  species: string | null;
  nickname: string | null;
  cp: number | null;
  level: number | null;
  ivs: Ivs | null;
  hpMax: number | null;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  firstTimeSec: number;
  ranked: boolean;
  unrankedReason?: 'no-species' | 'no-ivs' | 'not-in-rankings';
  speciesRank?: number;
  speciesScore?: number;
  csvName?: string;
  dex?: number;
  types?: string[];
  recommendedMoves?: { fast: string; charged: [string, string] };
  iv50?: IvRankResult;
  iv51?: IvRankResult;
}

export function rankCollection(
  inputs: Array<{ source: string; pokemon: ExtractedMon[] }>,
  league: League,
  rankings: Map<string, SpeciesRanking>,
  statsById: Map<string, BaseStats>,
): RankedPokemon[] {
  const cap = LEAGUE_CAPS[league];
  const rank50 = createIvRanker(cap, 50);
  const rank51 = createIvRanker(cap, 51);
  const out: RankedPokemon[] = [];
  for (const { source, pokemon } of inputs) {
    for (const p of pokemon) {
      if (p.cp !== null && p.cp > cap) continue;
      const base: RankedPokemon = {
        speciesId: p.speciesId ?? null,
        species: p.species,
        nickname: p.nickname,
        cp: p.cp,
        level: p.level ?? null,
        ivs: p.ivs,
        hpMax: p.hp?.max ?? null,
        confidence: p.confidence ?? 'low',
        source,
        firstTimeSec: p.firstTimeSec,
        ranked: false,
      };
      const stats = p.speciesId ? statsById.get(p.speciesId) : undefined;
      const r = p.speciesId ? rankings.get(p.speciesId) : undefined;
      if (!p.speciesId || !stats) {
        out.push({ ...base, unrankedReason: 'no-species' });
        continue;
      }
      if (!r) {
        out.push({ ...base, unrankedReason: 'not-in-rankings' });
        continue;
      }
      if (!p.ivs) {
        out.push({ ...base, unrankedReason: 'no-ivs' });
        continue;
      }
      out.push({
        ...base,
        ranked: true,
        speciesRank: r.rank,
        speciesScore: r.score,
        csvName: r.csvName,
        dex: r.dex,
        types: r.types,
        recommendedMoves: r.moves,
        iv50: rank50(p.speciesId, stats, p.ivs) ?? undefined,
        iv51: rank51(p.speciesId, stats, p.ivs) ?? undefined,
      });
    }
  }
  const ivRank = (p: RankedPokemon) => p.iv50?.rank ?? Infinity;
  return out.sort(
    (a, b) =>
      Number(b.ranked) - Number(a.ranked) ||
      (b.speciesScore ?? 0) - (a.speciesScore ?? 0) ||
      ivRank(a) - ivRank(b) ||
      (b.cp ?? 0) - (a.cp ?? 0),
  );
}
```

- [ ] Step 4: run → PASS. Step 5: commit `feat: rank an extracted collection for a league`.

---

### Task 5: CLI and real run

**Files:** Create `src/rank-cli.ts`; modify `package.json` (script `"rank": "tsx src/rank-cli.ts"`).

- [ ] Step 1: implement

```ts
import fs from 'node:fs';
import path from 'node:path';
import { loadGamemaster } from './core/gamemaster.ts';
import { parseRankingsCsv } from './core/rankings.ts';
import { LEAGUE_CAPS, type League } from './core/ivrank.ts';
import { rankCollection, type ExtractedMon } from './core/rank.ts';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const league = (opt('--league') ?? 'ultra') as League;
const csvFile = opt('--csv');
const top = Number(opt('--top') ?? 30);
if (!(league in LEAGUE_CAPS) || !csvFile || !args.length) {
  console.error('usage: npm run rank -- --league great|ultra|master --csv <pvpoke rankings csv> [--top N] <extraction.json>...');
  process.exit(1);
}

const gm = loadGamemaster();
const rankings = parseRankingsCsv(fs.readFileSync(csvFile, 'utf8'), gm.idByName);
const inputs = args.map(f => ({
  source: path.basename(f),
  pokemon: (JSON.parse(fs.readFileSync(f, 'utf8')) as { pokemon: ExtractedMon[] }).pokemon,
}));
const pokemon = rankCollection(inputs, league, rankings, gm.statsById);

fs.mkdirSync('out/ranked', { recursive: true });
const outFile = path.join('out/ranked', `${league}.json`);
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      league,
      cap: LEAGUE_CAPS[league],
      generatedAt: new Date().toISOString(),
      sources: inputs.map(i => i.source),
      csv: path.basename(csvFile),
      pokemon,
    },
    null,
    2,
  ),
);

const ranked = pokemon.filter(p => p.ranked);
console.log(
  `\n\x1b[1m${league.toUpperCase()} LEAGUE\x1b[0m  ${ranked.length} ranked, ${pokemon.length - ranked.length} unranked → ${outFile}\n`,
);
console.log('  pvp#  species                     score   CP    IVs       IV#50  SP%    L@cap  IV#51  conf');
for (const p of ranked.slice(0, top)) {
  const iv = p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?';
  console.log(
    `  ${String(p.speciesRank).padStart(4)}  ${(p.csvName ?? '').padEnd(26)}  ${p.speciesScore!.toFixed(1).padStart(5)}  ${String(p.cp ?? '?').padStart(5)}  ${iv.padEnd(8)}  ${String(p.iv50?.rank ?? '?').padStart(5)}  ${(p.iv50?.statProductPct ?? 0).toFixed(1).padStart(5)}  ${String(p.iv50?.level ?? '?').padStart(5)}  ${String(p.iv51?.rank ?? '?').padStart(5)}  ${p.confidence}`,
  );
}
const reasons = pokemon.filter(p => !p.ranked).map(p => `${p.species ?? '?'} (${p.unrankedReason})`);
if (reasons.length) console.log(`\n  unranked: ${reasons.join(', ')}`);
```

- [ ] Step 2: run `npm run rank -- --league ultra --csv samples/cp2500_all_overall_rankings.csv out/only-iv-full-hd.json`
      Expected: ~217 ranked, table printed, `out/ranked/ultra.json` written.
- [ ] Step 3: sanity-check 2–3 rows against pvpoke's own IV rank for that species (rank 1 spread is low-attack, high-bulk).
- [ ] Step 4: `npx vitest run`, `npx tsc --noEmit`; commit `feat: rank CLI writing out/ranked/<league>.json`.

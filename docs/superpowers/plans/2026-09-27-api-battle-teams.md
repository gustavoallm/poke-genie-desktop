# API Split, Battle Simulator and Team Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the repo into `api/` + `front/`, serve ranked data over HTTP, add a pvpoke-style battle simulator and an automatic team generator with locks.

**Architecture:** npm workspaces. `api/` holds all domain code (extraction, ranking, battle, teams), CLIs and a `node:http` server; `front/` is the Vite React viewer talking to `/api` through the dev proxy.

**Tech Stack:** Node 24, TypeScript (tsx), vitest, Vite 8, React 19. No new runtime dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-api-battle-teams-design.md`.
- `samples/` and `out/` stay at the repo root; code reaches them through `api/src/paths.ts`.
- CLI path arguments resolve against `process.env.INIT_CWD ?? process.cwd()`.
- API port 4000; errors as JSON `{ error }`.
- Simulator gate: ≥ 85% win/loss agreement with pvpoke's 1-1 leads matchups (top 100 species).

---

## Phase 1 — Restructure

### Task 1: Move files and fix paths

- [ ] Move files per the spec table (plain `mv`; nothing is committed yet).
- [ ] Create `api/src/paths.ts`:

```ts
import path from 'node:path';
export const API_ROOT = path.resolve(import.meta.dirname, '..');
export const ROOT = path.resolve(API_ROOT, '..');
export const DATA = path.join(API_ROOT, 'data');
export const OUT = path.join(ROOT, 'out');
export const SAMPLES = path.join(ROOT, 'samples');
export const TRUTH = path.join(API_ROOT, 'test', 'truth');
/** CLI arguments are relative to where npm was invoked, not the workspace folder. */
export const fromInvocation = (p: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
```

- [ ] Replace hard-coded `'out'`, `'data/gamemaster.json'`, `'poc/truth'`, `'samples/...'`, `'poc/test/fixtures'` with `paths.ts` constants / a `test/helpers.ts` `fixture(name)` helper; update relative imports.
- [ ] `api/package.json` (deps: ffmpeg-static, sharp, tesseract.js, @tesseract.js-data/eng; dev: typescript, tsx, vitest, @types/node; scripts extract/rank/score/regroup/dump-fixtures/test/typecheck), `api/tsconfig.json`; `front/package.json` (react, react-dom; dev: vite, @vitejs/plugin-react, @types/react, @types/react-dom, typescript, vitest; scripts dev/build/test/typecheck), `front/vite.config.ts` root = front; root `package.json` with `workspaces` and forwarding scripts; reinstall.
- [ ] Verify: `npm test` (all workspaces) green, both typechecks clean, `npm run regroup -- iv-screenshot video-only-iv video-attack-plus-iv && npm run score` → `GATE: PASS`, `npm run rank -- --league ultra --csv samples/cp2500_all_overall_rankings.csv out/only-iv-full-hd.json` works from the root.

## Phase 2 — API server

### Task 2: `api/src/server.ts` + front switch

- [ ] Test first (`api/test/server.test.ts`): start the server on an ephemeral port with `OUT` pointed at a temp dir holding a small `ranked/ultra.json`; `GET /api/health` 200, `GET /api/leagues` → `["ultra"]`, `GET /api/ranked/ultra` → file content, `GET /api/ranked/nope` → 404 JSON, unknown route → 404.
- [ ] Implement `createServer({ outDir })` returning `http.Server`; `npm run dev -w api` runs `tsx watch src/server.ts`.
- [ ] Front: replace glob import with `fetch('/api/leagues')` + `fetch('/api/ranked/:league')` (loading / error states), Vite proxy `/api` → `http://localhost:4000`; root `npm run dev` starts both (small `scripts/dev.mjs` spawning the two workspace dev scripts).
- [ ] Verify by running both and loading the page (headless Chrome screenshot).

## Phase 3 — Battle simulator

### Task 3: Data + type chart + combatant + damage

- [ ] Download `rankings/all/leads/rankings-{1500,2500}.json` to `api/data/pvpoke/`.
- [ ] `api/src/core/battle/types-chart.ts` (18×18 effectiveness), `combatant.ts` (build from speciesId/IVs/level/shadow/moves), `damage.ts`. Tests: known damage values (e.g. effectiveness of Hydro Cannon on Charizard = 1.6; neutral/resisted/double-resisted products).

### Task 4: Battle engine + AI + rating

- [ ] `api/src/core/battle/battle.ts`: `simulate(a, b, shields: [n, n]): { rating: number; winner; turns }`. Tests on hand-checkable duels (a mon with no charged moves loses to an identical mon with one; shields absorb one charged move each; CMP tie-break).
- [ ] `api/test/battle/pvpoke-agreement.test.ts`: build meta combatants from the leads rankings file (pvpoke moveset, gamemaster default IVs, shadow flag from `_shadow`), simulate every listed matchup/counter of the top 100 species at 1-1, assert agreement ≥ 0.85; print disagreements to iterate on.

## Phase 4 — Team generator

### Task 5: Matrix, scoring, search, CLI, endpoint

- [ ] `api/src/core/teams/meta.ts` (top N meta combatants), `candidates.ts` (user mons → combatants, moves real-or-assumed, `assumedElite`), `matrix.ts`, `score.ts`, `generate.ts` (`generateTeams({ league, candidates, meta, locks, top }): Team[]`).
- [ ] Tests: scoring penalises shared losers; locks always included; distinct dex; roles assigned per spec; deterministic ordering.
- [ ] CLI `api/src/cli/teams.ts` → `out/teams/<league>.json` + printed top 10; `POST /api/teams` using a per-league cached matrix.

## Phase 5 — Teams tab

### Task 6: Front

- [ ] `front/src/components/Teams.tsx` (+ lock picker, team cards), tab switch in `App`; pure helpers tested with vitest.
- [ ] Verify with the running app (screenshot).

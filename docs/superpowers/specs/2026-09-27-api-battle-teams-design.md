# API split, battle simulator and team generator — Design

**Date:** 2026-09-27
**Status:** Approved

## Goal

Generate PvP teams automatically from the user's box (like pvpoke's team builder, without
picking manually), served by a local API to the React front. Along the way, split the repo
into two projects: `api/` and `front/`.

## Decisions

| Topic         | Decision                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Structure     | npm workspaces: `api/` (Node + TS) and `front/` (Vite + React); `samples/`, `out/` stay at the root                        |
| API           | Node's built-in `http` (no framework): `GET /api/health`, `GET /api/leagues`, `GET /api/ranked/:league`, `POST /api/teams` |
| Simulation    | Own 1v1 engine with pvpoke's rules, validated against pvpoke's published matchups (≥ 85% win/loss agreement)               |
| User movesets | Extracted moves when present, otherwise pvpoke's recommended; assumed elite moves flagged                                  |
| Generation    | Top 10 teams from the whole box, with optional locked members (1–2)                                                        |
| Meta          | League top 50 from pvpoke rankings, pvpoke movesets, gamemaster default IVs                                                |

## Phase 1 — Restructure (no logic changes)

| From                                                                                      | To                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/core/*`                                                                              | `api/src/core/*`                                            |
| `poc/src/{frames,ocr,classify,parse,ivbars,group,solve,pipeline,score,types,progress}.ts` | `api/src/extraction/`                                       |
| `poc/src/cli.ts`, `score-cli.ts`, `regroup-cli.ts`, `dump-fixtures.ts`, `src/rank-cli.ts` | `api/src/cli/{extract,score,regroup,dump-fixtures,rank}.ts` |
| `poc/test/*.test.ts`, `src/test/*.test.ts`                                                | `api/test/extraction/`, `api/test/core/`                    |
| `poc/test/fixtures`, `poc/truth`                                                          | `api/test/fixtures`, `api/test/truth`                       |
| `data/`                                                                                   | `api/data/`                                                 |
| `web/*`                                                                                   | `front/*`                                                   |

`api/src/paths.ts` defines `ROOT`, `DATA`, `OUT`, `SAMPLES`, `TRUTH`; hard-coded relative
paths are replaced by these. CLI file arguments resolve against `INIT_CWD` (the directory npm
was invoked from), so `npm run extract -- samples/x.mp4` still works from the root.
Root scripts forward to the workspaces: `extract`, `rank`, `teams`, `score`, `regroup`, `test`,
`dev` (API + front together), `ui`.

Gate: all existing tests pass, and `npm run score` → `GATE: PASS`.

## Phase 2 — API server

`api/src/server.ts` on port 4000; reads `out/ranked/*.json` from disk per request (so `npm run rank`
updates are picked up), JSON responses, 404/400/500 as JSON `{ error }`. The front fetches
`/api/leagues` and `/api/ranked/:league` (Vite proxy `/api` → `http://localhost:4000`) instead of
glob-importing files; loading and error states shown.

## Phase 3 — Battle simulator (`api/src/core/battle/`)

- **Combatant:** species base stats, IVs, level, shadow flag → atk (×1.2 shadow), def (×5/6 shadow),
  max HP (⌊(base.hp + iv)·cpm⌋); fast move + 1–2 charged moves from the gamemaster.
- **Damage:** `⌊0.5 · power · (atk·atkBuff)/(def·defBuff) · STAB · effectiveness · 1.3⌋ + 1`,
  STAB 1.2, effectiveness product of 1.6 / 0.625 / 0.390625 per defending type (type chart built in).
- **Turns:** 0.5 s. A fast move occupies `turns` turns; its damage and energy apply when it completes.
  Energy caps at 100. A charged move can be thrown at the start of a turn when the Pokémon is
  not mid fast-move and has the energy; simultaneous charged moves resolve higher attack first (CMP).
  Buffs from the gamemaster (`buffs`, `buffTarget`, `buffApplyChance`) apply with stages ±4 and
  multiplier `(4+n)/4` or `4/(4−n)`; chance-based buffs apply only when `buffApplyChance` is 1.
- **AI:** throw immediately if the opponent's next fast move would faint us; otherwise, when a charged
  move is affordable: if the opponent has shields and a cheaper move exists, throw the cheapest (bait);
  else throw the highest-damage affordable move, waiting for the best move if it is affordable within
  the next fast move and we are not in danger. Shield every charged move while shields remain.
- **Rating:** `⌊500 · dealt/oppMaxHp + 500 · ownHpLeft/ownMaxHp⌋`, 500 = tie; scenarios 0-0, 1-1, 2-2.
- **Validation:** pvpoke `rankings/all/leads/rankings-<cap>.json` (1-1 shields) downloaded once to
  `api/data/pvpoke/`; for the top 100 species, each listed matchup/counter is a case
  (win if pvpoke rating > 500). Target ≥ 85% agreement; a vitest test asserts the threshold.

## Phase 4 — Team generator (`api/src/core/teams/`)

- **Candidates:** ranked user mons (best copy per species), top 40 by pvpoke score; moves from extraction
  when present, else pvpoke's recommended; `assumedElite` flag per mon.
- **Matrix:** rating[candidate][meta][scenario] for scenarios 0-0/1-1/2-2; cached per league in memory.
- **Team score:** threat weight `w_t` = pvpoke score; `coverage(t)` = best member's average rating vs t;
  `losers(t)` = members whose average rating < 500; score = Σ w_t · (coverage(t) − 150·max(0, losers(t)−1)) / Σ w_t.
- **Search:** all 3-combinations with distinct dex numbers that include every locked member; top 10.
- **Roles:** lead = best 1-1 average, closer = best 0-0 average, safe swap = the remaining member.
- **Output:** team members (with roles, moves, assumed-elite flags), score, meta coverage % (threats with
  coverage > 500), top 5 threats (lowest coverage).
- **Surfaces:** `POST /api/teams { league, locks: speciesId[] }`; CLI `npm run teams -- --league ultra [--lock id]...`
  writing `out/teams/<league>.json`.

## Phase 5 — Teams tab (front)

Tab next to the leagues' ranked table: lock pickers (search your ranked mons), "Generate", list of teams
with sprites, roles, moves (assumed elite flagged), score, coverage and threats.

## Out of scope

Shadow detection in the user's box, 3v3 switching simulation, energy carry-over, move-timing
optimisation beyond the AI rules above.

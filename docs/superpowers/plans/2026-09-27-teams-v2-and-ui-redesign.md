# Team Generator v2 + UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Role-aware, strength-blended team scoring with a team analyzer, and a redesigned front (sidebar layout, type-color style, faceted filters, team list + heatmap, My team report).

**Architecture:** Pure scoring in `api/src/core/teams/generate.ts` (+ `analyze.ts`), service/endpoint wiring in `service.ts`/`server.ts`; front rebuilt around a sidebar shell with small reusable components; pure front logic (filters, readiness) unit-tested.

**Tech Stack:** Node 24, TypeScript, vitest, Vite 8, React 19, plain CSS.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-teams-v2-and-ui-redesign-design.md`.
- Role weights (0-0, 1-1, 2-2): lead `[0.2, 0.6, 0.2]`, safe swap `[1/3,1/3,1/3]`, closer `[0.6, 0.3, 0.1]`.
- Blend: `rating = (1 − k)·coverageNorm + k·strengthNorm`, `k = 0.6·(1 − style)`; 0–100.
- Candidates: top 60 by pvpoke score + locked/analysed copies. Max 2 locks.
- No new dependencies. Type colors as CSS tokens.

## Tasks

### Task 1: Scoring v2 (TDD)

- [ ] Tests (`api/test/teams/generate.test.ts`): role weights applied; best role permutation chosen; strength blend reorders teams (a strong-species team beats a slightly better coverage team at style 0, not at style 1); matchups returned per member; rating 0–100.
- [ ] Implement in `generate.ts`; keep `scoreTeam` exported for reuse.

### Task 2: Analyze (TDD)

- [ ] Tests (`api/test/teams/analyze.test.ts`): rank among all teams; swaps list best replacement per slot with positive delta and fixed threats; weakest slot = slot with largest best-swap gain.
- [ ] Implement `analyze.ts`; service `analyze(league, keys, style)`; `POST /api/teams/analyze` with validation (tests in `server.test.ts`).

### Task 3: Calibration + acceptance

- [ ] Script: where does the user's Empoleon + Swampert + Giratina (A) rank for style 0…1; choose default style; record results in the spec.

### Task 4: Front shell + components

- [ ] Tokens (type colors, light/dark), sidebar shell, `Segmented`, `Combobox`, `RangeSlider`, `TypePill`, `Heatmap`; pure helpers tested (`typeColor`, combobox filtering).

### Task 5: My rankings filters

- [ ] Extend `filters.ts` (types any/all, IV rank ≤, SP ≥, CP range, readiness, elite, confidence multi) with tests; sidebar filter panel, active chips, rounded rows.

### Task 6: Team builder view

- [ ] Locks, style slider, list + detail with heatmap (shield toggle), threats.

### Task 7: My team view

- [ ] 3 slot comboboxes → verdict → heatmap → threats → swaps.

### Task 8: Verify

- [ ] All tests, typechecks, extraction gate; headless screenshots of the three views (light and dark).

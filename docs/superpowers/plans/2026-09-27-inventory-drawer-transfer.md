# Inventory, Drawer, Transfer, Ignore-IVs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-league inventory with form overrides, live per-league rankings, ignore-IVs team mode, a 3-league drawer and a My box view with transfer suggestions.

**Architecture:** `api/src/core/inventory.ts` (pure evaluation) + `inventoryStore.ts` (reads `out/*.json`, overrides); server endpoints read the store; teams service takes its league list from the store. Front adds `verdict.ts` (pure), `Drawer`, `BoxView`, and ignore-IVs toggles.

**Tech Stack:** Node 24, TypeScript, vitest, React 19, Vite 8.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-inventory-drawer-transfer-design.md`.
- Leagues: great 1500, ultra 2500, master ∞; pvpoke data `api/data/pvpoke/overall-<cap>.json`.
- Transfer defaults: keep top N = 2 copies, species rank ≤ K = 100.

## Tasks

- [ ] **1. Inventory core (TDD):** dedupe, overrides (validated), per-league eval incl. copy position; `rankedForLeague(inventory, league)` → RankedFile.
- [ ] **2. Store + endpoints (TDD):** read `out/*.json` extraction outputs; `GET /api/inventory`, live `GET /api/ranked/:league`, `GET /api/leagues`, `PUT /api/overrides/:key`.
- [ ] **3. Teams from inventory + ignoreIvs (TDD):** service uses the store; `buildCandidates(..., { ignoreIvs })` uses pvpoke default IVs/level.
- [ ] **4. Front verdict logic (TDD):** `verdict(p, {keepCopies, topSpecies})`, grouping for the Transfer section.
- [ ] **5. Drawer, My box view, ignore-IVs toggles, form picker.**
- [ ] **6. Apply Stunfisk → Galarian overrides; full verification + screenshots.**

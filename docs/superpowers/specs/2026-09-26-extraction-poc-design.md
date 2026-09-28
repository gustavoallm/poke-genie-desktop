# Extraction POC — Design

**Date:** 2026-09-26
**Status:** Approved

## Context

Poke Genie Desktop will turn Pokémon GO screen recordings and screenshots into a local
JSON collection, ranked against pvpoke league rankings (species score + IV stat-product
rank) and browsed in a React UI. Everything runs locally with npm/pip libraries only.

The risky part is extraction (OCR + pixel reading) from low-resolution recordings
(samples are 384x848, H.264, 60 fps). This POC answers one question: **can a Node +
TypeScript pipeline (ffmpeg-static, sharp, tesseract.js) extract the data accurately
enough?** If not, the same pipeline is retried with Python + RapidOCR.

## Inputs (samples/, gitignored)

| File                       | Content                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `video-only-iv.mp4`        | Appraisal overlay open, tapping ▶ between mons (~2 s each)    |
| `video-attack-plus-iv.mp4` | Detail screen, scroll to moves, open menu, Appraise, next mon |
| `video-bag-model.mp4`      | Scrolling the bag grid                                        |
| `iv-screenshot.jpeg`       | Single appraisal screenshot (736x1600)                        |

## Pipeline

1. **Frames** — videos sampled at 5 fps with ffmpeg-static; images used as one frame.
   Frames nearly identical to the previous kept frame (small grayscale thumbnail diff)
   are skipped.
2. **Normalize** — every frame resized to 768 px width (2x upscale for the samples) so
   region coordinates are expressed as fractions of width/height and OCR sees larger text.
3. **Classify** — one full-frame OCR pass, keyword rules:
   - `This <species> was` → `appraisal`
   - `TAGS` + `EGG` → `bag`
   - `STARDUST` / `WEIGHT` / `GYMS & RAIDS` (without the `APPRAISE` menu) → `detail`
     (a scrolled detail screen can show stats and moves in one frame, so moves are
     part of `detail`)
   - otherwise `other` (menus, transitions) — discarded
4. **Extract** per screen type:
   - `appraisal`: CP, nickname, HP (current/max), species (regex on
     `This (.+?) was`), IVs 0–15 from the pixel fill of the three bars
   - `detail`: CP, nickname, HP, types, candy family, and moves when the list is
     visible (lines after `GYMS & RAIDS` ending in a number; first = fast move)
   - `bag`: for each grid cell, CP + name
5. **Group + vote** — consecutive frames sharing CP (and nickname when read) form one
   Pokémon; each field takes the majority value across its frames. Bag cells are
   deduplicated across frames by (CP, name).

## Output

- `out/<sample>.json` — `{ source, pokemon: [...], bag: [...] }`
- `out/<sample>/` — per-frame debug crops/OCR text for inspecting misreads

## Accuracy measurement

`poc/truth/<sample>.json` holds hand-written ground truth read from the frames. A scorer
matches extracted mons to truth (by CP) and reports per-field accuracy plus missed/extra
mons.

## Go / no-go gate

| Field                  | Pass  |
| ---------------------- | ----- |
| CP, species, IVs       | ≥ 95% |
| HP, moves, bag CP+name | ≥ 90% |

Pass → build the product on approach A. Fail → rerun extraction with Python + RapidOCR
behind the same output format and scorer, compare.

## Out of scope

React UI, pvpoke CSV import, gamemaster, IV-rank math, species/form solving, shadow/lucky
flags. These are deterministic and do not need de-risking.

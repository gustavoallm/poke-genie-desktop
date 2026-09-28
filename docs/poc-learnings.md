# Extraction POC: results and learnings

**Date:** 2026-09-26 · **Branch:** `poc/extraction` (nothing committed yet)
**Spec:** [docs/superpowers/specs/2026-09-26-extraction-poc-design.md](docs/superpowers/specs/2026-09-26-extraction-poc-design.md)
**Plan:** [docs/superpowers/plans/2026-09-26-extraction-poc.md](docs/superpowers/plans/2026-09-26-extraction-poc.md)

## Decision

**Approach A (Node + TypeScript: ffmpeg-static, sharp, tesseract.js) passes the go/no-go gate.**
We don't need the Python + RapidOCR fallback. The product can be built on this stack.

| Field                  | Result | Gate  | Without the CP solver |
| ---------------------- | ------ | ----- | --------------------- |
| CP                     | 100.0% | ≥ 95% | 81.3%                 |
| Species                | 100.0% | ≥ 95% | 81.3%                 |
| IVs (exact)            | 100.0% | ≥ 95% | 81.3%                 |
| HP                     | 100.0% | ≥ 90% | 81.3%                 |
| Moves                  | 100.0% | ≥ 90% | 83.3%                 |
| Nickname               | 93.8%  | ≥ 90% | 75.0%                 |
| Bag recall (CP + name) | 93.2%  | ≥ 90% | same                  |
| Bag precision          | 94.8%  | ≥ 90% | same                  |

- **Test set:** 16 Pokémon across 3 inputs (a screenshot, an appraisal-only video, a detail + appraise video) and 59 bag cells.
- **What "without the CP solver" means:** those numbers are raw OCR plus voting. The scorer matches Pokémon by CP, so in raw mode one misread CP counts as a miss on every field of that Pokémon. That is why the raw column is flat at 81%.

**Speed:** about 22 s for a 21 s video and about 40 s for a 40 s video (4 OCR workers), roughly real time. The screenshot takes under 1 s.

## How to run

```bash
npm install
npm run poc -- samples/video-only-iv.mp4 samples/iv-screenshot.jpeg   # writes out/<name>.json
npm run poc -- --raw <files>    # same, without the CP/IV consistency solver
npm run score                   # compares out/*.json with poc/truth/*.json, prints the gate
npm test                        # 32 unit tests (vitest)
npx tsx poc/src/dump-fixtures.ts   # regenerates OCR fixtures from samples/
```

`samples/`, `out/` are gitignored. `data/gamemaster.json` comes from pvpoke, downloaded once from their GitHub. Nothing else touches the network, and the tesseract language data loads from `node_modules/@tesseract.js-data/eng`.

## What we learned

### Input and recording

- **The appraisal screen is the best single screen.** It shows CP, nickname, HP, IV bars and the species name, from the sentence "This **Charizard** was caught…". Nicknames like `.M 84` hide the species everywhere else.
- **The appraisal overlay has ◀ ▶ arrows, so you can stay in appraisal and tap through mons** (`video-only-iv.mp4`, about 2 s per mon). This is the fastest recording flow for species, IVs, CP and HP.
- **Moves exist only on the detail screen** (scrolled down). Use the detail + appraise flow (`video-attack-plus-iv.mp4`, about 6 s per mon) when moves matter.
- **The sample videos were 384×848**, probably compressed when transferred from the phone, and the pipeline still passes. Full-resolution recordings should only help.

### OCR (tesseract.js)

- A full-frame OCR pass on a 2× upscaled grayscale frame (normalised to 768 px wide) reads the species sentence, nickname, `168 / 168 HP`, types, candy family and move names well, at about 1 s per frame.
- **CP is the hard field:** white digits over the Pokémon's scene. Per-frame accuracy is about 40–46% whatever the preprocessing (crop, whitelist, white threshold), because compression pulls the "white" text to about 220–235 and many frames don't show the CP at all. **Don't try to fix CP with better OCR; derive it** (see the solver section).
- Move names sometimes come out lowercase (`0 waterfall 13`) and energy bars add junk tokens (`Hydro Pump Sy 135`). The parser keeps words of 3 or more letters that contain a lowercase letter, stops at the first junk token, and title-cases the result.
- The leading dot of nicknames is often dropped (`.M 84` becomes `M84`). Compare nicknames with `normalizeName` (uppercase alphanumerics only).
- The bag header "TAGS / POKEMON / EGGS" is often clipped at the screen edge (`AGS POKEMON E`). Classify the bag by **POKEMON + Search** instead.
- The bag's scroll handle on the right edge is read as a letter (`Hippowdon A`), so words in the rightmost 6% are dropped.
- Two harmless tesseract warnings appear: "Invalid resolution 25 dpi" and "Image too small to scale".

### IV bars (pixels, no OCR)

- **This is very precise.** Per-row fill ratios land within about 0.05 of a whole number (11.95, 13.98). An earlier by-eye estimate of mine was wrong where the pixels were right, so trust the pixels and verify with the CP formula.
- The colours, calibrated at 768 px:

  | Element               | Colour                                                          |
  | --------------------- | --------------------------------------------------------------- |
  | Orange fill           | ≈ RGB(235,150,70)                                               |
  | Maxed stat (15), pink | ≈ (224,125,132) in screenshots, darker ≈ (207,100,125) in video |
  | Grey track            | 195–225                                                         |
  | White panel           | ≥ 244                                                           |

- **Traps found:**
  - The red screen backdrop (≈199,95,96) looks like the pink fill, so a bar only counts where it starts right after white panel pixels.
  - Anti-aliasing leaves about 4 px between the white panel and the bar start at 2× upscale, so the reader tolerates 6.
  - Video compression breaks each bar (about 16 px tall) into row fragments, so rows within 10 px are merged; bars are about 70 px apart.
  - **The bars animate when appraisal opens.** An early frame read Palkia as 10/10/10. Majority voting across frames outvotes it.

### The CP/HP/IV consistency solver (`poc/src/solve.ts`) — the key idea

- CP and HP follow deterministic formulas from base stats, IVs and the level's CP multiplier (`poc/src/cp.ts`). Given **species + IVs (from pixels) + HP max (reliable OCR)**, only 1–3 CPs are possible, and the noisy CP reads (`898`, `2876`, `37`) just pick between them. Poke Genie works the same way.
- **What it also gives us:**
  - **The form.** Palkia and Dialga were **Origin Forme** (raid catches from 11/2024). Only the Origin base stats fit their CP and HP. pvpoke rankings need the form-level `speciesId`, so this is required anyway.
  - **The level**, needed for IV rank and power-up math later.
  - **IV correction** when a bar reads ±1 off and the CP read disagrees.
- **Rules:**
  - HP max must match exactly.
  - IVs may move ±1 from the bar reading.
  - CP evidence, in order of strength: exact read, then a substring of 3+ digits or a one-digit misread, then a 2-digit prefix.
  - With no CP evidence, it accepts only a unique answer.
  - Shadow, Mega and Primal entries are excluded as candidates: Shadow has the same stats as the normal form, and Mega and Primal are temporary.
- **How the IV truth was checked:** every IV truth value in `poc/truth/` fits the CP formula exactly. The CP formula independently confirmed the pixel reader.

### Grouping frames into Pokémon

- **Group by HP max, not CP.** HP (`150 / 150 HP`, dark on white) reads reliably; CP doesn't. Grouping on CP attached Mewtwo's moves to Gyarados.
- A key change only starts a new Pokémon if one of the next two frames confirms it; otherwise it's treated as a misread and outvoted.
- Detail frames scrolled down to the moves often lack the CP; they attach to the current group through HP.

## Full-HD run, 2026-09-27 (`samples/only-iv-full-hd.mp4`)

- **The input:** 1320×2868 HEVC at 60 fps, 6 min 49 s, 780 MB, recorded with the Appraise ◀ ▶ flow at about 2–3 s per mon.
- **The result:** 223 Pokémon in about 6 minutes. The run went through three CP-parse and grouping fixes; the final numbers are **201 high confidence (90%), 19 medium, 3 low**.
- **Spot check:** 8 random high-confidence mons compared against the frames. After the fixes below, all 8 match on CP and IVs.
- **What full HD broke, and the fixes:**
  - **IV bars (12% → 100% of appraisal frames read).** The red backdrop above the panel is brighter in HD and passed the loosened pink test. Fix: a bar must have white panel pixels on _both_ ends, since background streaks run into non-white.
  - **Every CP below 2000 went unread.** The leading 1 comes out as `l`, `I` or `|` (`cpl797`), sometimes doubled (`cpl1731`) or after a stray letter (`cpr1803`). Fix: map look-alikes to 1 and drop a doubled look-alike. A leading 0 (`cp?064`) marks the read as unusable, since a CP never starts with 0.
  - **Consecutive mons merged into one record:**
    - Heatran and Dragonite share max HP 133. Fix: also split on a confirmed species change.
    - Two Mewtwos share both species and HP. Fix: also split on a confirmed IV change. It only applies once the current mon's IVs are backed by ≥ 2 frames and the new value is confirmed by the next 2, which avoids splits while the bars animate in.
  - **What didn't work:** splitting on CP or nickname. Repeated misreads (`23`, `23`) split one mon into several; that produced 243 records with duplicates.
- **The confidence rating** (`solve.ts`):
  - **high:** the IVs, HP and an exact CP read all agree with the formula.
  - **medium:** solved, but only after an IV correction or on partial CP evidence.
  - **low:** unsolved.

  The UI should flag medium and low for a manual look.

- **New tooling:**
  - `npm run poc` shows an ANSI progress bar (extraction, duplicate skipping, OCR) with an ETA.
  - `npm run regroup -- <name> [--reread-ivs]` rebuilds results from the saved per-frame OCR, without re-running OCR.
  - OCR concurrency is capped at 8 frames in flight, which keeps memory flat on long videos.
  - ffmpeg is killed together with its parent process. Otherwise on Windows it survives Ctrl+C and keeps writing frames.
- **Recording pace:** at 2–3 s per mon, a 7-minute video covers about 220 mons. All ~2,500 would take about 1.5–2 hours of recording, so batch it by league, CP range or search filter.

## Known limitations and risks

- **The test set is small:** 16 Pokémon and 59 bag cells, all from one account, one phone and one team colour (Valor, so a red backdrop). Other teams have different backdrop colours, untested.
- Two different Pokémon in a row with the **same max HP** would merge into one group. It's rare, but a species-change split should be added.
- The nickname `.M 91 T` was read as `MIT` (Rhyperior), which is the main nickname miss.
- Bag: 4 cells missed and 3 wrong reads. Fast scrolling gives only 1–2 sharp frames per row, and a cell must be seen in ≥ 2 frames to count.
- Bag entries have no species for nicknamed Pokémon. Link them to detail or appraisal scans by (CP, nickname), or let the user pick in the UI.
- Not detected yet: shadow, purified, lucky and shiny flags, and costume forms. Regional forms (Galarian, Alolan) should resolve through base stats but are untested.
- **A detail-only recording (no appraisal) has no IVs,** so the solver can't pin the CP. That flow is untested.
- Level 51 (best buddy) is included in the CPM table; XL-candy maths is not modelled.

## Next steps

1. **Commit the POC branch** when you're ready. No commits were made in this session, by your choice.
2. **Validate at scale:** record 50+ mons at full resolution with the appraisal ◀ ▶ flow and add a truth file. It's worth checking another team colour too.
3. **Product, v1:**
   - Import the pvpoke CSVs (`Desktop/Jogos/Pokemon/*/cp*_overall_rankings.csv`) and match by `speciesId`.
   - Compute each Pokémon's IV rank per league (stat product over all 4096 spreads, capped at level 50/51).
   - Build a React UI (Vite) with filters and sorting by league score, IV rank and moveset match, plus a JSON export.
   - Drag-and-drop videos and screenshots into a local Node server that runs this pipeline.
4. **Extraction polish:**
   - Validate move names against the gamemaster moves list.
   - Correct species names by fuzzy match against dex names.
   - Detect shadow and lucky.
   - Split groups on species change.
   - Read the bag at 10 fps.

## File map

| File                               | Role                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `poc/src/frames.ts`                | Video or image → 768 px PNG frames (5 fps, near-duplicates skipped)   |
| `poc/src/ocr.ts`                   | tesseract.js pool → lines and words with bounding boxes               |
| `poc/src/classify.ts`              | Screen type: appraisal / bag / detail / other                         |
| `poc/src/parse.ts`                 | CP, nickname, HP, species, types, candy, moves, bag cells             |
| `poc/src/ivbars.ts`                | IVs from the appraisal bar pixels                                     |
| `poc/src/group.ts`                 | Frames → Pokémon (split on HP max, majority vote), bag de-duplication |
| `poc/src/cp.ts`                    | CPM table, CP and HP formulas, `consistentIvs`                        |
| `poc/src/solve.ts`                 | Form, level, CP and IV consistency solver                             |
| `poc/src/pipeline.ts`, `cli.ts`    | End-to-end run → `out/<name>.json`                                    |
| `poc/src/score.ts`, `score-cli.ts` | Accuracy against `poc/truth/*.json` and the go/no-go gate             |
| `poc/test/`                        | Unit tests; `fixtures/` holds real frames with their OCR JSON         |

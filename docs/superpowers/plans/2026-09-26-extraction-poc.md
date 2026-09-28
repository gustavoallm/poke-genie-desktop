# Extraction POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node/TypeScript CLI that turns Pokémon GO recordings/screenshots into JSON and a scorer that measures extraction accuracy against hand-written truth, to make a go/no-go call on approach A.

**Architecture:** ffmpeg-static samples video frames to PNG (normalized to 768 px wide) → tesseract.js full-frame OCR with line/word boxes → keyword classifier (appraisal / bag / detail / other) → pure parsers per screen + pixel-based IV bar reader → grouping of consecutive frames per Pokémon with majority vote → JSON. A separate scorer compares JSON with `poc/truth/*.json`.

**Tech Stack:** Node 24, TypeScript (run with tsx), vitest, ffmpeg-static, sharp, tesseract.js 7 + @tesseract.js-data/eng (local traineddata, no network).

## Global Constraints

- Everything runs locally; tesseract must load traineddata from `node_modules/@tesseract.js-data/eng/4.0.0` (no CDN).
- Frames are normalized to **768 px width**; all region math uses fractions of width/height.
- `samples/` and `out/` are gitignored.
- Gate: CP, species, IVs ≥ 95%; HP, moves, bag CP+name ≥ 90%.

## File Structure

| File                                | Responsibility                                                       |
| ----------------------------------- | -------------------------------------------------------------------- |
| `poc/src/types.ts`                  | Shared types (OcrLine, FrameResult, PokemonRecord, BagEntry, Output) |
| `poc/src/frames.ts`                 | Video/image → normalized PNG frame files, near-duplicate skipping    |
| `poc/src/ocr.ts`                    | tesseract.js worker pool → `OcrLine[]`                               |
| `poc/src/classify.ts`               | `OcrLine[]` → screen type                                            |
| `poc/src/parse.ts`                  | Pure field parsers per screen type                                   |
| `poc/src/ivbars.ts`                 | Raw RGB → `{atk, def, hp}` from appraisal bars                       |
| `poc/src/group.ts`                  | Frame results → Pokémon records (grouping + vote), bag dedupe        |
| `poc/src/pipeline.ts`               | Orchestrates one input file, writes debug output                     |
| `poc/src/cli.ts`                    | `npm run poc -- <files...>`                                          |
| `poc/src/score.ts` / `score-cli.ts` | Accuracy report vs truth                                             |
| `poc/src/dump-fixtures.ts`          | Dev tool: OCR selected sample frames into `poc/test/fixtures/*.json` |
| `poc/test/*.test.ts`                | vitest unit tests                                                    |
| `poc/truth/*.json`                  | Hand-written ground truth                                            |

---

### Task 1: Scaffold, shared types, OCR + frames, fixtures

**Files:**

- Create: `tsconfig.json`, `poc/src/types.ts`, `poc/src/ocr.ts`, `poc/src/frames.ts`, `poc/src/dump-fixtures.ts`
- Create (generated): `poc/test/fixtures/{appraisal,moves,bag,detail,menu}.json`, `poc/test/fixtures/*.png`

**Interfaces — Produces:**

- `interface Box { x0: number; y0: number; x1: number; y1: number }`
- `interface OcrWord { text: string; conf: number; bbox: Box }`
- `interface OcrLine { text: string; conf: number; bbox: Box; words: OcrWord[] }`
- `interface OcrPage { width: number; height: number; lines: OcrLine[] }`
- `createOcr(poolSize?: number): Promise<{ recognize(png: Buffer): Promise<OcrPage>; close(): Promise<void> }>`
- `extractFrames(input: string, outDir: string, fps?: number): Promise<FrameFile[]>` where `interface FrameFile { index: number; timeSec: number; path: string }`

- [ ] **Step 1: tsconfig + types**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["poc"]
}
```

`poc/src/types.ts`:

```ts
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  conf: number;
  bbox: Box;
}
export interface OcrLine {
  text: string;
  conf: number;
  bbox: Box;
  words: OcrWord[];
}
export interface OcrPage {
  width: number;
  height: number;
  lines: OcrLine[];
}

export type ScreenType = 'appraisal' | 'bag' | 'detail' | 'other';

export interface Ivs {
  atk: number;
  def: number;
  hp: number;
}
export interface Hp {
  current: number;
  max: number;
}
export interface Moves {
  fast: string;
  charged: string[];
}

export interface FrameResult {
  frameIndex: number;
  timeSec: number;
  type: ScreenType;
  cp?: number;
  nickname?: string;
  hp?: Hp;
  species?: string;
  ivs?: Ivs;
  types?: string[];
  candy?: string;
  moves?: Moves;
  bag?: BagEntry[];
}

export interface PokemonRecord {
  cp: number;
  nickname: string | null;
  hp: Hp | null;
  species: string | null;
  ivs: Ivs | null;
  types: string[] | null;
  candy: string | null;
  moves: Moves | null;
  frameCount: number;
  firstTimeSec: number;
}

export interface BagEntry {
  cp: number;
  name: string;
}

export interface Output {
  source: string;
  pokemon: PokemonRecord[];
  bag: BagEntry[];
}
```

- [ ] **Step 2: OCR pool** — `poc/src/ocr.ts`

```ts
import { createScheduler, createWorker } from 'tesseract.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import type { OcrLine, OcrPage } from './types.ts';

const require = createRequire(import.meta.url);
const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0');

export async function createOcr(poolSize = 4) {
  const scheduler = createScheduler();
  for (let i = 0; i < poolSize; i++) {
    scheduler.addWorker(await createWorker('eng', 1, { langPath, gzip: true, cacheMethod: 'none' }));
  }
  return {
    async recognize(png: Buffer): Promise<OcrPage> {
      const img = sharp(png);
      const { width = 0, height = 0 } = await img.metadata();
      const gray = await img.grayscale().png().toBuffer();
      const { data } = await scheduler.addJob('recognize', gray, {}, { blocks: true });
      const lines: OcrLine[] = (data.blocks ?? [])
        .flatMap(b => b.paragraphs.flatMap(p => p.lines))
        .map(l => ({
          text: l.text.trim(),
          conf: l.confidence,
          bbox: l.bbox,
          words: l.words.map(w => ({ text: w.text, conf: w.confidence, bbox: w.bbox })),
        }));
      return { width, height, lines };
    },
    close: () => scheduler.terminate(),
  };
}
```

- [ ] **Step 3: Frames** — `poc/src/frames.ts`

```ts
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const run = promisify(execFile);
export const NORMALIZED_WIDTH = 768;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export interface FrameFile {
  index: number;
  timeSec: number;
  path: string;
}

async function thumb(file: string): Promise<Buffer> {
  return sharp(file).resize(32, 64, { fit: 'fill' }).grayscale().raw().toBuffer();
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export async function extractFrames(input: string, outDir: string, fps = 5): Promise<FrameFile[]> {
  const dir = path.join(outDir, 'frames');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  if (IMAGE_EXT.has(path.extname(input).toLowerCase())) {
    const file = path.join(dir, '00001.png');
    await sharp(input).resize({ width: NORMALIZED_WIDTH }).png().toFile(file);
    return [{ index: 0, timeSec: 0, path: file }];
  }

  await run(ffmpegPath as unknown as string, [
    '-v',
    'error',
    '-i',
    input,
    '-vf',
    `fps=${fps},scale=${NORMALIZED_WIDTH}:-2:flags=lanczos`,
    path.join(dir, '%05d.png'),
  ]);

  const names = (await fs.readdir(dir)).filter(n => n.endsWith('.png')).sort();
  const kept: FrameFile[] = [];
  let last: Buffer | null = null;
  for (const [i, name] of names.entries()) {
    const file = path.join(dir, name);
    const t = await thumb(file);
    if (last && meanAbsDiff(t, last) < 1.0) {
      await fs.rm(file);
      continue;
    }
    last = t;
    kept.push({ index: i, timeSec: i / fps, path: file });
  }
  return kept;
}
```

- [ ] **Step 4: Fixture dump tool** — `poc/src/dump-fixtures.ts`

Grabs specific timestamps from samples, stores the normalized PNG and its OCR as JSON fixtures for unit tests.

```ts
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createOcr } from './ocr.ts';
import { NORMALIZED_WIDTH } from './frames.ts';

const run = promisify(execFile);
const dir = 'poc/test/fixtures';
const picks: Array<[name: string, file: string, t: number | null]> = [
  ['appraisal', 'samples/video-only-iv.mp4', 16.5],
  ['appraisal-slaking', 'samples/video-only-iv.mp4', 1.0],
  ['appraisal-shot', 'samples/iv-screenshot.jpeg', null],
  ['moves', 'samples/video-attack-plus-iv.mp4', 15.3],
  ['detail', 'samples/video-attack-plus-iv.mp4', 0.2],
  ['menu', 'samples/video-attack-plus-iv.mp4', 3.2],
  ['bag', 'samples/video-bag-model.mp4', 12.5],
];

await fs.mkdir(dir, { recursive: true });
const ocr = await createOcr(2);
for (const [name, file, t] of picks) {
  const png = `${dir}/${name}.png`;
  if (t === null) await sharp(file).resize({ width: NORMALIZED_WIDTH }).png().toFile(png);
  else
    await run(ffmpegPath as unknown as string, [
      '-v',
      'error',
      '-y',
      '-ss',
      String(t),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale=${NORMALIZED_WIDTH}:-2:flags=lanczos`,
      png,
    ]);
  const page = await ocr.recognize(await fs.readFile(png));
  await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(page, null, 1));
  console.log(name, page.lines.map(l => l.text).join(' | '));
}
await ocr.close();
```

- [ ] **Step 5: Run it and eyeball the OCR**

Run: `npx tsx poc/src/dump-fixtures.ts`
Expected: 7 lines printed; `appraisal` contains `This Salamence was caught`, `.M 84`, `168 / 168 HP`; `moves` contains `Waterfall`, `Hydro Pump`, `Crunch`; `bag` contains `TAGS` and CP numbers. `npx tsc --noEmit` passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore poc docs
git commit -m "chore: scaffold extraction POC with local OCR and frame extraction"
```

---

### Task 2: Classifier and text parsers

**Files:**

- Create: `poc/src/classify.ts`, `poc/src/parse.ts`
- Test: `poc/test/parse.test.ts`

**Interfaces:**

- Consumes: `OcrPage`, `OcrLine` from Task 1
- Produces:
  - `classify(page: OcrPage): ScreenType`
  - `parseCommon(page: OcrPage): { cp?: number; nickname?: string; hp?: Hp }`
  - `parseSpecies(page: OcrPage): string | undefined`
  - `parseTypes(page: OcrPage): string[] | undefined`
  - `parseCandy(page: OcrPage): string | undefined`
  - `parseMoves(page: OcrPage): Moves | undefined`
  - `parseBag(page: OcrPage): BagEntry[]`
  - `normalizeName(s: string): string` (uppercase, strips dots/spaces/non-alphanumerics; used by scorer)

- [ ] **Step 1: Write failing tests** — `poc/test/parse.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { OcrPage } from '../src/types.ts';
import { classify } from '../src/classify.ts';
import { parseCommon, parseSpecies, parseTypes, parseCandy, parseMoves, parseBag, normalizeName } from '../src/parse.ts';

const fx = (n: string): OcrPage => JSON.parse(fs.readFileSync(`poc/test/fixtures/${n}.json`, 'utf8'));

describe('classify', () => {
  it('detects each screen type', () => {
    expect(classify(fx('appraisal'))).toBe('appraisal');
    expect(classify(fx('appraisal-shot'))).toBe('appraisal');
    expect(classify(fx('bag'))).toBe('bag');
    expect(classify(fx('moves'))).toBe('detail');
    expect(classify(fx('detail'))).toBe('detail');
    expect(classify(fx('menu'))).toBe('other');
  });
});

describe('parsers', () => {
  it('reads CP, nickname, HP and species on appraisal', () => {
    const p = fx('appraisal');
    expect(parseCommon(p)).toEqual({ cp: 3204, nickname: '.M 84', hp: { current: 168, max: 168 } });
    expect(parseSpecies(p)).toBe('Salamence');
  });
  it('reads the appraisal screenshot', () => {
    const p = fx('appraisal-shot');
    expect(parseCommon(p).cp).toBe(2497);
    expect(parseSpecies(p)).toBe('Charizard');
  });
  it('reads types, candy and moves on the detail screen', () => {
    const p = fx('moves');
    expect(parseTypes(p)).toEqual(['WATER', 'FLYING']);
    expect(parseCandy(p)).toBe('MAGIKARP');
    expect(parseMoves(p)).toEqual({ fast: 'Waterfall', charged: ['Hydro Pump', 'Crunch'] });
  });
  it('returns nothing for moves when the moves list is not visible', () => {
    expect(parseMoves(fx('appraisal'))).toBeUndefined();
  });
  it('reads bag cells as CP + name pairs', () => {
    const cells = parseBag(fx('bag')).map(c => `${c.cp} ${normalizeName(c.name)}`);
    expect(cells).toEqual(expect.arrayContaining(['2681 HIPPOWDON', '2599 HERACROSS', '2590 LUGIA', '2584 GARDEVOIR']));
  });
  it('normalizes names for comparison', () => {
    expect(normalizeName('*.M 89 D')).toBe('M89D');
    expect(normalizeName('Gyarados 87 /')).toBe('GYARADOS87');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run poc/test/parse.test.ts`
Expected: FAIL — cannot resolve `../src/classify.ts`.

- [ ] **Step 3: Implement** — `poc/src/classify.ts`

```ts
import type { OcrPage, ScreenType } from './types.ts';

export function classify(page: OcrPage): ScreenType {
  const text = page.lines
    .map(l => l.text)
    .join('\n')
    .toUpperCase();
  if (/THIS\s+\S.*\s+WAS\b/.test(text)) return 'appraisal';
  if (/TAGS/.test(text) && /EGG/.test(text)) return 'bag';
  if (/STARDUST|WEIGHT|GYMS\s*&?\s*RAIDS/.test(text) && !/APPRAISE/.test(text)) return 'detail';
  return 'other';
}
```

`poc/src/parse.ts`

```ts
import type { BagEntry, Hp, Moves, OcrLine, OcrPage } from './types.ts';

const TYPES = [
  'NORMAL',
  'FIRE',
  'WATER',
  'GRASS',
  'ELECTRIC',
  'ICE',
  'FIGHTING',
  'POISON',
  'GROUND',
  'FLYING',
  'PSYCHIC',
  'BUG',
  'ROCK',
  'GHOST',
  'DRAGON',
  'DARK',
  'STEEL',
  'FAIRY',
];

export function normalizeName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cleanNickname(s: string): string {
  return s
    .replace(/^[^A-Za-z0-9.]+/, '')
    .replace(/[^A-Za-z0-9]+$/, '')
    .trim();
}

const HP_RE = /(\d{1,4})\s*\/\s*(\d{1,4})\s*HP/i;

export function parseCommon(page: OcrPage): { cp?: number; nickname?: string; hp?: Hp } {
  const out: { cp?: number; nickname?: string; hp?: Hp } = {};
  for (const l of page.lines) {
    if (l.bbox.y0 > page.height * 0.12) continue;
    const m = l.text.match(/[c¢][pr]\s*(\d{2,4})/i);
    if (m) {
      out.cp = Number(m[1]);
      break;
    }
  }
  const hpLine = page.lines.find(l => HP_RE.test(l.text));
  if (hpLine) {
    const m = hpLine.text.match(HP_RE)!;
    out.hp = { current: Number(m[1]), max: Number(m[2]) };
    const above = page.lines
      .filter(l => l.bbox.y1 <= hpLine.bbox.y0 + 4 && hpLine.bbox.y0 - l.bbox.y1 < 160)
      .filter(l => !/LUCKY|SHADOW|PURIFIED/i.test(l.text) && /[A-Za-z0-9]/.test(l.text))
      .sort((a, b) => b.bbox.y1 - a.bbox.y1);
    if (above[0]) out.nickname = cleanNickname(above[0].text);
  }
  return out;
}

export function parseSpecies(page: OcrPage): string | undefined {
  const text = page.lines.map(l => l.text).join(' ');
  return text.match(/This\s+(.+?)\s+was\b/i)?.[1]?.trim();
}

export function parseTypes(page: OcrPage): string[] | undefined {
  const line = page.lines.find(l => /WEIGHT/i.test(l.text) && /HEIGHT/i.test(l.text));
  if (!line) return undefined;
  const found = line.text
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(w => TYPES.includes(w));
  return found.length ? found : undefined;
}

export function parseCandy(page: OcrPage): string | undefined {
  const line = page.lines.find(l => /STARDUST/i.test(l.text) && /CANDY/i.test(l.text));
  return line?.text
    .toUpperCase()
    .match(/STARDUST\s+(.+?)\s+CANDY/)?.[1]
    ?.trim();
}

const MOVE_WORD = /^[A-Z][A-Za-z'()-]{2,}$/;

function moveName(line: OcrLine): string | undefined {
  if (!/\d+(\s*\+\s*\d+)?\s*$/.test(line.text)) return undefined;
  const words = line.text.split(/\s+/);
  while (words.length && !MOVE_WORD.test(words[0])) words.shift();
  const name: string[] = [];
  for (const w of words) {
    if (!MOVE_WORD.test(w) || !/[a-z]/.test(w)) break;
    name.push(w);
  }
  return name.length ? name.join(' ') : undefined;
}

export function parseMoves(page: OcrPage): Moves | undefined {
  const start = page.lines.findIndex(l => /GYMS\s*&?\s*RAIDS/i.test(l.text));
  if (start < 0) return undefined;
  const names: string[] = [];
  for (const l of page.lines.slice(start + 1)) {
    if (/NEW ATTACK|TOTAL WALKED|CAUGHT|OBTAINED/i.test(l.text)) break;
    const n = moveName(l);
    if (n) names.push(n);
    if (names.length === 3) break;
  }
  if (!names.length) return undefined;
  return { fast: names[0], charged: names.slice(1) };
}

function column(x: number, width: number): number {
  return Math.min(2, Math.floor((x / width) * 3));
}

export function parseBag(page: OcrPage): BagEntry[] {
  const cpRows = page.lines.filter(
    l => l.bbox.y0 > page.height * 0.15 && l.bbox.y1 < page.height * 0.88 && l.words.filter(w => /\d{3,4}/.test(w.text)).length >= 2,
  );
  const entries: BagEntry[] = [];
  for (const row of cpRows) {
    const nameLine = page.lines.find(l => l !== row && l.bbox.y0 - row.bbox.y0 > 140 && l.bbox.y0 - row.bbox.y0 < 230 && l.conf > 50);
    if (!nameLine) continue;
    const cps = new Map<number, number>();
    for (const w of row.words) {
      const d = w.text.replace(/\D/g, '');
      if (d.length === 4) cps.set(column((w.bbox.x0 + w.bbox.x1) / 2, page.width), Number(d));
    }
    const names = new Map<number, string[]>();
    for (const w of nameLine.words) {
      const c = column((w.bbox.x0 + w.bbox.x1) / 2, page.width);
      names.set(c, [...(names.get(c) ?? []), w.text]);
    }
    for (const [c, cp] of cps) {
      const name = cleanNickname((names.get(c) ?? []).join(' '));
      if (name) entries.push({ cp, name });
    }
  }
  return entries;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run poc/test/parse.test.ts`
Expected: PASS. If a fixture's OCR text differs from the spike (e.g. the CP line), adjust the regex, not the test expectation — the expectations are what the screen actually shows.

- [ ] **Step 5: Commit**

```bash
git add poc/src/classify.ts poc/src/parse.ts poc/test/parse.test.ts
git commit -m "feat: classify screens and parse CP, HP, species, types, candy, moves, bag"
```

---

### Task 3: IV bar reader

**Files:**

- Create: `poc/src/ivbars.ts`
- Test: `poc/test/ivbars.test.ts`

**Interfaces:**

- Produces: `readIvBars(rgb: Buffer, width: number, height: number): Ivs | null` (rgb = raw 3-channel buffer at 768 width) and `readIvBarsFromFile(file: string): Promise<Ivs | null>`

Calibrated colours (768 px frames): fill orange ≈ (235,150,70), fill pink for 15 ≈ (224,125,132), track grey 195–225 neutral, panel white ≥ 244. Red screen backdrop ≈ (199,95,96) must NOT count → bars must start right after white panel pixels.

- [ ] **Step 1: Failing tests** — `poc/test/ivbars.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readIvBars, readIvBarsFromFile } from '../src/ivbars.ts';

function synth(ivs: [number, number, number]): { buf: Buffer; w: number; h: number } {
  const w = 768,
    h = 1696,
    buf = Buffer.alloc(w * h * 3);
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    const i = (y * w + x) * 3;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, x < 50 ? [199, 95, 96] : [255, 255, 255]);
  const x0 = 92,
    x1 = 356;
  ivs.forEach((iv, k) => {
    const yTop = 1310 + k * 72,
      fillEnd = x0 + Math.round(((x1 - x0) * iv) / 15);
    for (let y = yTop; y < yTop + 14; y++)
      for (let x = x0; x < x1; x++) {
        if (x === x0 + 88 || x === x0 + 176) continue;
        set(x, y, x < fillEnd ? (iv === 15 ? [224, 125, 132] : [235, 150, 70]) : [215, 215, 215]);
      }
  });
  return { buf, w, h };
}

describe('readIvBars', () => {
  it.each([[[0, 0, 0]], [[15, 15, 15]], [[13, 9, 14]], [[1, 7, 12]]] as const)('reads %j', ivs => {
    const { buf, w, h } = synth([...ivs] as [number, number, number]);
    expect(readIvBars(buf, w, h)).toEqual({ atk: ivs[0], def: ivs[1], hp: ivs[2] });
  });
  it('returns null when there are no bars', () => {
    expect(readIvBars(Buffer.alloc(768 * 1696 * 3, 255), 768, 1696)).toBeNull();
  });
  it('reads the real appraisal screenshot (Charizard: HP 15 is pink)', async () => {
    const ivs = await readIvBarsFromFile('poc/test/fixtures/appraisal-shot.png');
    expect(ivs?.hp).toBe(15);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run poc/test/ivbars.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `poc/src/ivbars.ts`

```ts
import sharp from 'sharp';
import type { Ivs } from './types.ts';

type Px = [number, number, number];
const isFill = ([r, g, b]: Px) => r >= 205 && r - b >= 80 && g < 200;
const isTrack = ([r, g, b]: Px) => Math.max(r, g, b) - Math.min(r, g, b) <= 16 && r >= 185 && r <= 240;
const isWhite = ([r, g, b]: Px) => Math.min(r, g, b) >= 244;

const MAX_GAP = 8;
const MIN_WHITE_BEFORE = 6;

interface RowBar {
  start: number;
  end: number;
  fillEnd: number;
}

function scanRow(px: (x: number) => Px, xMax: number, minLen: number): RowBar | null {
  let white = 0;
  for (let x = 0; x < xMax; x++) {
    const p = px(x);
    if (isWhite(p)) {
      white++;
      continue;
    }
    if (white >= MIN_WHITE_BEFORE && (isFill(p) || isTrack(p))) {
      let end = x,
        fillEnd = isFill(p) ? x : -1,
        gap = 0;
      for (let k = x + 1; k < xMax; k++) {
        const q = px(k);
        if (isFill(q)) {
          fillEnd = k;
          end = k;
          gap = 0;
        } else if (isTrack(q)) {
          end = k;
          gap = 0;
        } else if (++gap > MAX_GAP) break;
      }
      if (end - x >= minLen) return { start: x, end, fillEnd };
      x = end;
    }
    white = 0;
  }
  return null;
}

export function readIvBars(rgb: Buffer, width: number, height: number): Ivs | null {
  const xMax = Math.round(width * 0.6);
  const minLen = Math.round(width * 0.25);
  const groups: RowBar[][] = [];
  let lastY = -10;
  for (let y = Math.round(height * 0.6); y < Math.round(height * 0.95); y++) {
    const bar = scanRow(
      x => {
        const i = (y * width + x) * 3;
        return [rgb[i], rgb[i + 1], rgb[i + 2]];
      },
      xMax,
      minLen,
    );
    if (!bar) continue;
    if (y - lastY > 2) groups.push([]);
    groups[groups.length - 1].push(bar);
    lastY = y;
  }
  const bars = groups.filter(g => g.length >= 5);
  if (bars.length !== 3) return null;
  const iv = (g: RowBar[]) => {
    const values = g.map(b => (b.fillEnd < 0 ? 0 : Math.round(((b.fillEnd - b.start + 1) / (b.end - b.start + 1)) * 15)));
    return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  };
  return { atk: iv(bars[0]), def: iv(bars[1]), hp: iv(bars[2]) };
}

export async function readIvBarsFromFile(file: string): Promise<Ivs | null> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return readIvBars(data, info.width, info.height);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run poc/test/ivbars.test.ts` → PASS. Also print `readIvBarsFromFile` for `appraisal.png` and `appraisal-slaking.png` and compare with the frame by eye.

- [ ] **Step 5: Commit**

```bash
git add poc/src/ivbars.ts poc/test/ivbars.test.ts
git commit -m "feat: read appraisal IVs from bar pixel fill"
```

---

### Task 4: Grouping and voting

**Files:**

- Create: `poc/src/group.ts`
- Test: `poc/test/group.test.ts`

**Interfaces:**

- Consumes: `FrameResult`, `PokemonRecord`, `BagEntry` (Task 1)
- Produces: `groupPokemon(frames: FrameResult[], minFrames: number): PokemonRecord[]`, `dedupeBag(frames: FrameResult[], minSeen: number): BagEntry[]`

Rules: frames of type `appraisal`/`detail` only. A new group starts when a frame's CP differs from the current group's first CP **and** one of the next two CP-bearing frames agrees with the new CP (otherwise it's an OCR misread and joins the current group). Frames without CP join the current group. Each field is the most frequent value (JSON-stringified) among frames that have it; ties → first seen. Groups with fewer than `minFrames` frames are dropped.

- [ ] **Step 1: Failing tests** — `poc/test/group.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import type { FrameResult } from '../src/types.ts';
import { groupPokemon, dedupeBag } from '../src/group.ts';

const f = (i: number, p: Partial<FrameResult>): FrameResult => ({ frameIndex: i, timeSec: i / 5, type: 'appraisal', ...p });

describe('groupPokemon', () => {
  it('splits by CP, votes fields and ignores a one-frame misread', () => {
    const frames = [
      f(0, { cp: 3844, species: 'Slaking', ivs: { atk: 12, def: 13, hp: 14 } }),
      f(1, { cp: 3844, species: 'Slakinq', ivs: { atk: 12, def: 13, hp: 14 } }),
      f(2, { cp: 3814, species: 'Slaking' }),
      f(3, { cp: 3844, species: 'Slaking', ivs: { atk: 12, def: 12, hp: 14 } }),
      f(4, { type: 'other' }),
      f(5, { cp: 3716, species: 'Dragonite' }),
      f(6, { cp: 3716, species: 'Dragonite', nickname: '.M 96' }),
      f(7, { type: 'detail', moves: { fast: 'Dragon Tail', charged: ['Outrage'] } }),
    ];
    const out = groupPokemon(frames, 2);
    expect(out.map(p => p.cp)).toEqual([3844, 3716]);
    expect(out[0]).toMatchObject({ species: 'Slaking', ivs: { atk: 12, def: 13, hp: 14 }, frameCount: 4 });
    expect(out[1]).toMatchObject({ nickname: '.M 96', moves: { fast: 'Dragon Tail', charged: ['Outrage'] } });
  });
  it('drops groups below minFrames', () => {
    expect(groupPokemon([f(0, { cp: 100 })], 2)).toEqual([]);
    expect(groupPokemon([f(0, { cp: 100 })], 1)).toHaveLength(1);
  });
});

describe('dedupeBag', () => {
  it('keeps entries seen in at least minSeen frames', () => {
    const b = (i: number, bag: FrameResult['bag']) => f(i, { type: 'bag', bag });
    const out = dedupeBag(
      [
        b(0, [
          { cp: 2708, name: '.M 89' },
          { cp: 2700, name: '.M 89' },
        ]),
        b(1, [{ cp: 2708, name: 'M 89' }]),
      ],
      2,
    );
    expect(out).toEqual([{ cp: 2708, name: '.M 89' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run poc/test/group.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `poc/src/group.ts`

```ts
import type { BagEntry, FrameResult, PokemonRecord } from './types.ts';
import { normalizeName } from './parse.ts';

function vote<T>(values: (T | undefined)[]): T | null {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    if (v === undefined) continue;
    const k = JSON.stringify(v);
    const e = counts.get(k);
    if (e) e.n++;
    else counts.set(k, { v, n: 1 });
  }
  let best: { v: T; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best ? best.v : null;
}

export function groupPokemon(frames: FrameResult[], minFrames: number): PokemonRecord[] {
  const relevant = frames.filter(f => f.type === 'appraisal' || f.type === 'detail');
  const groups: FrameResult[][] = [];
  for (const [i, fr] of relevant.entries()) {
    const current = groups[groups.length - 1];
    const currentCp = current?.find(g => g.cp !== undefined)?.cp;
    const isNew =
      fr.cp !== undefined &&
      fr.cp !== currentCp &&
      (currentCp === undefined ||
        relevant
          .slice(i + 1)
          .filter(n => n.cp !== undefined)
          .slice(0, 2)
          .some(n => n.cp === fr.cp));
    if (!current || isNew) groups.push([fr]);
    else current.push(fr);
  }
  return groups
    .filter(g => g.length >= minFrames && g.some(f => f.cp !== undefined))
    .map(g => ({
      cp: vote(g.map(f => f.cp))!,
      nickname: vote(g.map(f => f.nickname)),
      hp: vote(g.map(f => f.hp)),
      species: vote(g.map(f => f.species)),
      ivs: vote(g.map(f => f.ivs)),
      types: vote(g.map(f => f.types)),
      candy: vote(g.map(f => f.candy)),
      moves: vote(g.map(f => f.moves)),
      frameCount: g.length,
      firstTimeSec: g[0].timeSec,
    }));
}

export function dedupeBag(frames: FrameResult[], minSeen: number): BagEntry[] {
  const seen = new Map<string, { entry: BagEntry; n: number }>();
  for (const f of frames) {
    for (const e of f.bag ?? []) {
      const k = `${e.cp}|${normalizeName(e.name)}`;
      const s = seen.get(k);
      if (s) s.n++;
      else seen.set(k, { entry: e, n: 1 });
    }
  }
  return [...seen.values()].filter(s => s.n >= minSeen).map(s => s.entry);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add poc/src/group.ts poc/test/group.test.ts
git commit -m "feat: group frames per pokemon with majority vote and dedupe bag cells"
```

---

### Task 5: Pipeline + CLI

**Files:**

- Create: `poc/src/pipeline.ts`, `poc/src/cli.ts`

**Interfaces:**

- Consumes: everything above
- Produces: `processFile(input: string, ocr: Ocr): Promise<Output>`; writes `out/<name>.json` and `out/<name>/frames.json` (per-frame type, parsed fields, OCR text).

- [ ] **Step 1: Implement** — `poc/src/pipeline.ts`

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrameResult, Output } from './types.ts';
import { extractFrames } from './frames.ts';
import type { createOcr } from './ocr.ts';
import { classify } from './classify.ts';
import { parseBag, parseCandy, parseCommon, parseMoves, parseSpecies, parseTypes } from './parse.ts';
import { readIvBarsFromFile } from './ivbars.ts';
import { dedupeBag, groupPokemon } from './group.ts';

type Ocr = Awaited<ReturnType<typeof createOcr>>;

export async function processFile(input: string, ocr: Ocr): Promise<Output> {
  const name = path.basename(input, path.extname(input));
  const outDir = path.join('out', name);
  const frames = await extractFrames(input, outDir);

  const results = await Promise.all(
    frames.map(async (fr): Promise<FrameResult & { text: string }> => {
      const page = await ocr.recognize(await fs.readFile(fr.path));
      const type = classify(page);
      const base = { frameIndex: fr.index, timeSec: fr.timeSec, type, text: page.lines.map(l => l.text).join(' | ') };
      if (type === 'bag') return { ...base, bag: parseBag(page) };
      if (type === 'appraisal') {
        const ivs = await readIvBarsFromFile(fr.path);
        return { ...base, ...parseCommon(page), species: parseSpecies(page), ivs: ivs ?? undefined };
      }
      if (type === 'detail') {
        return { ...base, ...parseCommon(page), types: parseTypes(page), candy: parseCandy(page), moves: parseMoves(page) };
      }
      return base;
    }),
  );

  await fs.writeFile(path.join(outDir, 'frames.json'), JSON.stringify(results, null, 1));
  const minFrames = frames.length > 1 ? 2 : 1;
  const output: Output = {
    source: path.basename(input),
    pokemon: groupPokemon(results, minFrames),
    bag: dedupeBag(results, frames.length > 1 ? 2 : 1),
  };
  await fs.writeFile(path.join('out', `${name}.json`), JSON.stringify(output, null, 2));
  return output;
}
```

`poc/src/cli.ts`

```ts
import { createOcr } from './ocr.ts';
import { processFile } from './pipeline.ts';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run poc -- <video-or-image>...');
  process.exit(1);
}
const ocr = await createOcr();
for (const file of files) {
  const t0 = Date.now();
  const out = await processFile(file, ocr);
  console.log(`${out.source}: ${out.pokemon.length} pokemon, ${out.bag.length} bag cells in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const p of out.pokemon) {
    console.log(
      `  CP${p.cp} ${p.nickname ?? '?'} ${p.species ?? '?'} iv=${p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?'} hp=${p.hp?.max ?? '?'} moves=${p.moves ? [p.moves.fast, ...p.moves.charged].join(',') : '?'}`,
    );
  }
}
await ocr.close();
```

- [ ] **Step 2: Run on all samples**

Run: `npm run poc -- samples/iv-screenshot.jpeg samples/video-only-iv.mp4 samples/video-attack-plus-iv.mp4 samples/video-bag-model.mp4`
Expected: completes; `out/*.json` written; ~9 mons in video-only-iv, ~7 in video-attack-plus-iv, 1 in screenshot, dozens of bag cells.

- [ ] **Step 3: Commit**

```bash
git add poc/src/pipeline.ts poc/src/cli.ts
git commit -m "feat: end-to-end extraction pipeline and CLI"
```

---

### Task 6: Ground truth + scorer

**Files:**

- Create: `poc/truth/iv-screenshot.json`, `poc/truth/video-only-iv.json`, `poc/truth/video-attack-plus-iv.json`, `poc/truth/video-bag-model.json`
- Create: `poc/src/score.ts`, `poc/src/score-cli.ts`
- Test: `poc/test/score.test.ts`

**Interfaces:**

- Truth format: `{ pokemon: TruthMon[]; bag?: BagEntry[] }` with `interface TruthMon { cp: number; nickname?: string; species?: string; hpMax?: number; ivs?: Ivs; moves?: Moves }` — fields absent are not scored.
- Produces: `score(out: Output, truth: Truth): Report` where `interface Report { fields: Record<string, { ok: number; total: number }>; missed: number[]; extra: number[] }`

- [ ] **Step 1: Write truth by hand.** Read each mon from zoomed frames (`out/<name>/frames/*.png`), NOT from the pipeline output. IV truth: zoom the appraisal panel and count bar fill in fifteenths; cross-check each mon with CP/HP consistency where unsure. For the bag, transcribe every fully visible cell (CP + name) across the video.

- [ ] **Step 2: Failing test** — `poc/test/score.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { score } from '../src/score.ts';

describe('score', () => {
  it('matches by CP and scores only fields present in truth', () => {
    const r = score(
      {
        source: 'x',
        bag: [
          { cp: 2708, name: '.M 89' },
          { cp: 1, name: 'junk' },
        ],
        pokemon: [
          {
            cp: 3844,
            nickname: 'M 71',
            hp: { current: 223, max: 223 },
            species: 'Slaking',
            ivs: { atk: 1, def: 2, hp: 3 },
            types: null,
            candy: null,
            moves: null,
            frameCount: 3,
            firstTimeSec: 0,
          },
          {
            cp: 999,
            nickname: null,
            hp: null,
            species: null,
            ivs: null,
            types: null,
            candy: null,
            moves: null,
            frameCount: 2,
            firstTimeSec: 1,
          },
        ],
      },
      {
        pokemon: [
          { cp: 3844, nickname: '.M 71', species: 'Slaking', hpMax: 223, ivs: { atk: 1, def: 2, hp: 4 } },
          { cp: 3716, species: 'Dragonite' },
        ],
        bag: [
          { cp: 2708, name: '.M 89' },
          { cp: 2690, name: '.M 62' },
        ],
      },
    );
    expect(r.fields.cp).toEqual({ ok: 1, total: 2 });
    expect(r.fields.nickname).toEqual({ ok: 1, total: 1 });
    expect(r.fields.species).toEqual({ ok: 1, total: 2 });
    expect(r.fields.ivs).toEqual({ ok: 0, total: 1 });
    expect(r.fields.bagRecall).toEqual({ ok: 1, total: 2 });
    expect(r.fields.bagPrecision).toEqual({ ok: 1, total: 2 });
    expect(r.missed).toEqual([3716]);
    expect(r.extra).toEqual([999]);
  });
});
```

- [ ] **Step 3: Implement** — `poc/src/score.ts`

```ts
import type { BagEntry, Ivs, Moves, Output } from './types.ts';
import { normalizeName } from './parse.ts';

export interface TruthMon {
  cp: number;
  nickname?: string;
  species?: string;
  hpMax?: number;
  ivs?: Ivs;
  moves?: Moves;
}
export interface Truth {
  pokemon: TruthMon[];
  bag?: BagEntry[];
}
export interface Report {
  fields: Record<string, { ok: number; total: number }>;
  missed: number[];
  extra: number[];
}

export function score(out: Output, truth: Truth): Report {
  const fields: Report['fields'] = {};
  const tally = (k: string, ok: boolean) => {
    fields[k] ??= { ok: 0, total: 0 };
    fields[k].total++;
    if (ok) fields[k].ok++;
  };
  const missed: number[] = [];
  for (const t of truth.pokemon) {
    const p = out.pokemon.find(x => x.cp === t.cp);
    tally('cp', !!p);
    if (!p) missed.push(t.cp);
    if (t.nickname !== undefined) tally('nickname', !!p?.nickname && normalizeName(p.nickname) === normalizeName(t.nickname));
    if (t.species !== undefined) tally('species', p?.species?.toUpperCase() === t.species.toUpperCase());
    if (t.hpMax !== undefined) tally('hp', p?.hp?.max === t.hpMax);
    if (t.ivs !== undefined) tally('ivs', JSON.stringify(p?.ivs) === JSON.stringify(t.ivs));
    if (t.moves !== undefined) tally('moves', JSON.stringify(p?.moves) === JSON.stringify(t.moves));
  }
  const extra = out.pokemon.filter(p => !truth.pokemon.some(t => t.cp === p.cp)).map(p => p.cp);
  if (truth.bag) {
    const key = (e: BagEntry) => `${e.cp}|${normalizeName(e.name)}`;
    const got = new Set(out.bag.map(key));
    const want = new Set(truth.bag.map(key));
    for (const k of want) tally('bagRecall', got.has(k));
    for (const k of got) tally('bagPrecision', want.has(k));
  }
  return { fields, missed, extra };
}
```

`poc/src/score-cli.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';
import { score, type Truth } from './score.ts';
import type { Output } from './types.ts';

const GATE: Record<string, number> = { cp: 95, species: 95, ivs: 95, hp: 90, moves: 90, nickname: 90, bagRecall: 90, bagPrecision: 90 };
const totals: Record<string, { ok: number; total: number }> = {};
for (const file of fs.readdirSync('poc/truth')) {
  const name = path.basename(file, '.json');
  const outFile = path.join('out', `${name}.json`);
  if (!fs.existsSync(outFile)) {
    console.log(`${name}: no output, run npm run poc first`);
    continue;
  }
  const r = score(
    JSON.parse(fs.readFileSync(outFile, 'utf8')) as Output,
    JSON.parse(fs.readFileSync(path.join('poc/truth', file), 'utf8')) as Truth,
  );
  console.log(`\n${name}  missed=${JSON.stringify(r.missed)} extra=${JSON.stringify(r.extra)}`);
  for (const [k, v] of Object.entries(r.fields)) {
    console.log(`  ${k.padEnd(13)} ${v.ok}/${v.total}`);
    totals[k] ??= { ok: 0, total: 0 };
    totals[k].ok += v.ok;
    totals[k].total += v.total;
  }
}
console.log('\nTOTAL');
let pass = true;
for (const [k, v] of Object.entries(totals)) {
  const pct = (100 * v.ok) / v.total,
    need = GATE[k] ?? 90,
    ok = pct >= need;
  pass &&= ok;
  console.log(`  ${k.padEnd(13)} ${pct.toFixed(1).padStart(5)}%  (need ${need}%)  ${ok ? 'PASS' : 'FAIL'}`);
}
console.log(`\nGATE: ${pass ? 'PASS' : 'FAIL'}`);
```

- [ ] **Step 4: Run** — `npx vitest run` → PASS; `npm run score` → prints report.

- [ ] **Step 5: Commit**

```bash
git add poc/truth poc/src/score.ts poc/src/score-cli.ts poc/test/score.test.ts
git commit -m "feat: ground truth and accuracy scorer with go/no-go gate"
```

---

### Task 7: Iterate and decide

- [ ] **Step 1:** For each FAIL field, inspect `out/<name>/frames.json` for the misread frames, fix the root cause in the parser/reader (add a unit test reproducing it first), rerun `npm run poc` + `npm run score`. Time-box: 3 iterations.
- [ ] **Step 2:** Write `docs/poc-results.md`: per-field accuracy table, runtime per video, failure modes that remain, and the decision (approach A go / Python + RapidOCR fallback).
- [ ] **Step 3: Commit**

```bash
git add -A poc docs
git commit -m "docs: extraction POC results and decision"
```

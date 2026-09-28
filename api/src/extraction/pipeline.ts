import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrameResult, Output } from './types.ts';
import { extractFrames } from './frames.ts';
import type { Ocr } from './ocr.ts';
import { classify } from './classify.ts';
import { parseBag, parseCandy, parseCommon, parseMoves, parseSpecies, parseTypes } from './parse.ts';
import { readIvBarsFromFile } from './ivbars.ts';
import { dedupeBag, groupPokemon } from './group.ts';
import { correctSpecies, solve, type Dex } from './solve.ts';
import { CACHE, EXTRACTIONS } from '../paths.ts';
import type { OnProgress } from './progress.ts';

// Frames in flight at once; each holds a decoded PNG, so this bounds memory on long videos.
const CONCURRENCY = 8;

/** `dex` enables CP/HP/IV consistency solving; pass null to score raw extraction only. */
export async function processFile(input: string, ocr: Ocr, dex: Dex | null, onProgress?: OnProgress): Promise<Output> {
  const name = path.basename(input, path.extname(input));
  const outDir = path.join(CACHE, name);
  const frames = await extractFrames(input, outDir, 5, onProgress);

  const analyze = async (fr: (typeof frames)[number]): Promise<FrameResult & { text: string }> => {
    const page = await ocr.recognize(await fs.readFile(fr.path));
    const type = classify(page);
    const base = { frameIndex: fr.index, timeSec: fr.timeSec, type, text: page.lines.map(l => l.text).join(' | ') };
    if (type === 'bag') return { ...base, bag: parseBag(page) };
    if (type === 'appraisal') {
      const ivs = await readIvBarsFromFile(fr.path);
      return { ...base, ...parseCommon(page), species: parseSpecies(page), types: parseTypes(page), ivs: ivs ?? undefined };
    }
    if (type === 'detail') {
      return { ...base, ...parseCommon(page), types: parseTypes(page), candy: parseCandy(page), moves: parseMoves(page) };
    }
    return base;
  };

  const results: Array<FrameResult & { text: string }> = new Array(frames.length);
  let next = 0,
    done = 0;
  onProgress?.('OCR', 0, frames.length);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, frames.length) }, async () => {
      while (next < frames.length) {
        const i = next++;
        results[i] = await analyze(frames[i]);
        onProgress?.('OCR', ++done, frames.length);
      }
    }),
  );

  await fs.writeFile(path.join(outDir, 'frames.json'), JSON.stringify(results, null, 1));
  const isVideo = frames.length > 1;
  if (dex) for (const r of results) if (r.species) r.species = correctSpecies(dex, r.species);
  const grouped = groupPokemon(results, isVideo ? 2 : 1);
  const output: Output = {
    source: path.basename(input),
    pokemon: dex ? grouped.map(p => solve(p, dex)) : grouped,
    bag: dedupeBag(results, isVideo ? 2 : 1),
  };
  await fs.mkdir(EXTRACTIONS, { recursive: true });
  await fs.writeFile(path.join(EXTRACTIONS, `${name}.json`), JSON.stringify(output, null, 2));
  return output;
}

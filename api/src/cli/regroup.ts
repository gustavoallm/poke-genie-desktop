// Rebuilds out/extractions/<name>.json from the saved per-frame OCR results (out/cache/<name>/frames.json) without re-running OCR.
// Use it after changing grouping or solving logic: npm run regroup -- <name> [--raw] [--reread-ivs]
// --reread-ivs re-measures the IV bars from the saved frame PNGs (after changing ivbars.ts).
// --reparse-types re-reads type words from the saved OCR text (after changing parseTypes).
import fs from 'node:fs';
import path from 'node:path';
import type { FrameResult, Output } from '../extraction/types.ts';
import { dedupeBag, groupPokemon } from '../extraction/group.ts';
import { correctSpecies, loadDex, solve } from '../extraction/solve.ts';
import { parseTypes } from '../extraction/parse.ts';
import { readIvBarsFromFile } from '../extraction/ivbars.ts';
import { CACHE, EXTRACTIONS } from '../paths.ts';

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const rereadIvs = args.includes('--reread-ivs');
const reparseTypes = args.includes('--reparse-types');
const names = args.filter(a => !a.startsWith('--'));
if (!names.length) {
  console.error('usage: npm run regroup -- [--raw] <sample-name>...');
  process.exit(1);
}
const dex = raw ? null : loadDex();
for (const name of names) {
  const framesFile = path.join(CACHE, name, 'frames.json');
  const frames = JSON.parse(fs.readFileSync(framesFile, 'utf8')) as FrameResult[];
  if (rereadIvs) {
    for (const f of frames.filter(f => f.type === 'appraisal')) {
      const ivs = await readIvBarsFromFile(path.join(CACHE, name, 'frames', `${String(f.frameIndex + 1).padStart(5, '0')}.png`));
      if (ivs) f.ivs = ivs;
      else delete f.ivs;
    }
    fs.writeFileSync(framesFile, JSON.stringify(frames, null, 1));
  }
  if (reparseTypes) {
    // Types from the saved OCR text (line order is kept; boxes are not needed).
    for (const f of frames as Array<FrameResult & { text?: string }>) {
      if ((f.type === 'appraisal' || f.type === 'detail') && f.text) {
        const lines = f.text.split(' | ').map(text => ({ text, conf: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, words: [] }));
        const types = parseTypes({ width: 0, height: 0, lines });
        if (types) f.types = types;
        else delete f.types;
      }
    }
  }
  if (dex) for (const f of frames) if (f.species) f.species = correctSpecies(dex, f.species);
  const isVideo = frames.length > 1;
  const grouped = groupPokemon(frames, isVideo ? 2 : 1);
  const output: Output = {
    source: name,
    pokemon: dex ? grouped.map(p => solve(p, dex)) : grouped,
    bag: dedupeBag(frames, isVideo ? 2 : 1),
  };
  fs.writeFileSync(path.join(EXTRACTIONS, `${name}.json`), JSON.stringify(output, null, 2));
  const count = (c: string) => output.pokemon.filter(p => p.confidence === c).length;
  console.log(
    `${name}: ${output.pokemon.length} pokemon (high ${count('high')}, medium ${count('medium')}, low ${count('low')}), ${output.bag.length} bag cells`,
  );
}

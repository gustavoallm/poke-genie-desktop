import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createOcr } from '../extraction/ocr.ts';
import { NORMALIZED_WIDTH } from '../extraction/frames.ts';
import path from 'node:path';
import { FIXTURES, SAMPLES } from '../paths.ts';

const run = promisify(execFile);
const dir = FIXTURES;
const picks: Array<[name: string, file: string, t: number | null]> = [
  ['appraisal', path.join(SAMPLES, 'video-only-iv.mp4'), 16.5],
  ['appraisal-slaking', path.join(SAMPLES, 'video-only-iv.mp4'), 1.0],
  ['appraisal-shot', path.join(SAMPLES, 'iv-screenshot.jpeg'), null],
  ['appraisal-groudon', path.join(SAMPLES, 'video-only-iv.mp4'), 15.0],
  ['appraisal-palkia', path.join(SAMPLES, 'video-attack-plus-iv.mp4'), 30.4],
  ['moves', path.join(SAMPLES, 'video-attack-plus-iv.mp4'), 15.3],
  ['detail', path.join(SAMPLES, 'video-attack-plus-iv.mp4'), 0.2],
  ['menu', path.join(SAMPLES, 'video-attack-plus-iv.mp4'), 3.2],
  ['bag', path.join(SAMPLES, 'video-bag-model.mp4'), 12.5],
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
  console.log(`\n== ${name}\n` + page.lines.map(l => `  [y${l.bbox.y0}] ${l.text}`).join('\n'));
}
await ocr.close();

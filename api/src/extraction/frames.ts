import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { OnProgress } from './progress.ts';

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

/** Runs ffmpeg, reporting progress from `-progress pipe:1` against the duration in its stderr header. */
function runFfmpeg(args: string[], onProgress?: OnProgress): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, ['-hide_banner', '-progress', 'pipe:1', '-nostats', ...args]);
    // On Windows a killed parent leaves ffmpeg running (and writing frames); take it down with us.
    const killChild = () => proc.kill();
    process.once('exit', killChild);
    process.once('SIGINT', () => {
      killChild();
      process.exit(130);
    });
    proc.on('close', () => process.off('exit', killChild));
    let durationSec = 0,
      stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      const m = !durationSec && stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (m) durationSec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    });
    proc.stdout.on('data', (d: Buffer) => {
      const us = [...d.toString().matchAll(/out_time_us=(\d+)/g)].pop()?.[1];
      if (us && durationSec)
        onProgress?.('Extracting frames', Math.min(Math.round(Number(us) / 1e6), Math.round(durationSec)), Math.round(durationSec));
    });
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))));
  });
}

export async function extractFrames(input: string, outDir: string, fps = 5, onProgress?: OnProgress): Promise<FrameFile[]> {
  const dir = path.join(outDir, 'frames');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  if (IMAGE_EXT.has(path.extname(input).toLowerCase())) {
    const file = path.join(dir, '00001.png');
    await sharp(input).resize({ width: NORMALIZED_WIDTH }).png().toFile(file);
    return [{ index: 0, timeSec: 0, path: file }];
  }

  await runFfmpeg(
    ['-i', input, '-an', '-vf', `fps=${fps},scale=${NORMALIZED_WIDTH}:-2:flags=lanczos`, path.join(dir, '%05d.png')],
    onProgress,
  );

  const names = (await fs.readdir(dir)).filter(n => n.endsWith('.png')).sort();
  const kept: FrameFile[] = [];
  let last: Buffer | null = null;
  for (const [i, name] of names.entries()) {
    const file = path.join(dir, name);
    const t = await thumb(file);
    onProgress?.('Skipping duplicate frames', i + 1, names.length);
    if (last && meanAbsDiff(t, last) < 1.0) {
      await fs.rm(file);
      continue;
    }
    last = t;
    kept.push({ index: i, timeSec: i / fps, path: file });
  }
  return kept;
}

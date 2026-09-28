import { FIXTURES } from '../../src/paths.ts';
import { describe, it, expect } from 'vitest';
import { readIvBars, readIvBarsFromFile } from '../../src/extraction/ivbars.ts';

function synth(ivs: [number, number, number], maxColor = [224, 125, 132]): { buf: Buffer; w: number; h: number } {
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
        set(x, y, x < fillEnd ? (iv === 15 ? maxColor : [235, 150, 70]) : [215, 215, 215]);
      }
  });
  return { buf, w, h };
}

describe('readIvBars', () => {
  it.each([[[0, 0, 0]], [[15, 15, 15]], [[13, 9, 14]], [[1, 7, 12]]] as const)('reads %j', ivs => {
    const { buf, w, h } = synth([...ivs] as [number, number, number]);
    expect(readIvBars(buf, w, h)).toEqual({ atk: ivs[0], def: ivs[1], hp: ivs[2] });
  });
  it('reads the darker video pink used for a maxed stat (Groudon 13/15/15)', () => {
    const { buf, w, h } = synth([13, 15, 15], [207, 100, 125]);
    expect(readIvBars(buf, w, h)).toEqual({ atk: 13, def: 15, hp: 15 });
  });
  it('returns null when there are no bars', () => {
    expect(readIvBars(Buffer.alloc(768 * 1696 * 3, 255), 768, 1696)).toBeNull();
  });
  it.each([
    ['appraisal-groudon', { atk: 13, def: 15, hp: 15 }],
    ['appraisal-palkia', { atk: 12, def: 10, hp: 15 }],
    ['appraisal', { atk: 12, def: 14, hp: 12 }],
    ['appraisal-hd-empoleon', { atk: 12, def: 13, hp: 14 }], // full-HD frame: bright red backdrop above the panel
  ])('reads the real video frame %s (IVs confirmed by the CP formula)', async (name, ivs) => {
    expect(await readIvBarsFromFile(`${FIXTURES}/${name}.png`)).toEqual(ivs);
  });
  it('reads the real appraisal screenshot (Charizard: HP 15 is pink)', async () => {
    const ivs = await readIvBarsFromFile(`${FIXTURES}/appraisal-shot.png`);
    expect(ivs?.hp).toBe(15);
  });
});

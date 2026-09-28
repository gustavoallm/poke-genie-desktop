import sharp from 'sharp';
import type { Ivs } from './types.ts';

// Calibrated on 768px-wide frames: orange fill ~(235,150,70); a maxed stat is pink, ~(224,125,132)
// in screenshots and darker ~(207,100,125) in videos; grey track 195-225; white panel >= 244.
// The red screen backdrop (~199,95,96) looks like pink, so a bar only starts right after white panel pixels.
type Px = [number, number, number];
const isOrange = ([r, g, b]: Px) => g - b >= 30;
const isPink = ([, g, b]: Px) => b >= g - 2;
const isFill = (p: Px) => p[0] >= 175 && p[0] - p[1] >= 60 && (isOrange(p) || isPink(p));
const isTrack = ([r, g, b]: Px) => Math.max(r, g, b) - Math.min(r, g, b) <= 16 && r >= 185 && r <= 240;
const isWhite = ([r, g, b]: Px) => Math.min(r, g, b) >= 244;

const MAX_GAP = 8;
const MIN_WHITE_BEFORE = 6;
const MAX_EDGE = 6; // anti-aliased pixels between the white panel and the bar start (~4px after 2x upscale)
const MAX_ROW_GAP = 10; // video compression breaks a ~16px bar into fragments; bars are ~70px apart
const MIN_BAR_ROWS = 4;

interface RowBar {
  start: number;
  end: number;
  fillEnd: number;
}

/** A real bar sits inside the white panel: white follows its end too. Backdrop streaks run into non-white. */
function whiteAfter(px: (x: number) => Px, end: number, xMax: number): boolean {
  let white = 0;
  for (let k = end + 1; k <= end + MAX_EDGE + MIN_WHITE_BEFORE && k < xMax; k++) {
    if (isWhite(px(k))) {
      if (++white >= MIN_WHITE_BEFORE) return true;
    } else if (white > 0) white = 0;
  }
  return false;
}

function scanRow(px: (x: number) => Px, xMax: number, minLen: number): RowBar | null {
  let white = 0,
    sinceWhite = 0;
  for (let x = 0; x < xMax; x++) {
    const p = px(x);
    if (isWhite(p)) {
      white++;
      sinceWhite = 0;
      continue;
    }
    if (white >= MIN_WHITE_BEFORE && sinceWhite <= MAX_EDGE && (isFill(p) || isTrack(p))) {
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
      if (end - x >= minLen && whiteAfter(px, end, xMax)) return { start: x, end, fillEnd };
      x = end;
      white = 0;
      continue;
    }
    if (++sinceWhite > MAX_EDGE) white = 0;
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
    if (y - lastY > MAX_ROW_GAP) groups.push([]);
    groups[groups.length - 1].push(bar);
    lastY = y;
  }
  const bars = groups.filter(g => g.length >= MIN_BAR_ROWS);
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

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

/**
 * Reads the number after the "CP" prefix. The CP font's leading 1 is often OCR'd as l, I or |
 * ("cpl797" = 1797), and a stray letter can follow the prefix ("cpr1803"), so look-alikes are mapped
 * to 1 and other letters dropped within a short window after the prefix.
 */
function parseCpText(text: string): number | undefined {
  const m = text.match(/[c¢][pr]([^\s]*(?:\s+\S+)?)/i);
  if (!m) return undefined;
  const digits = m[1]
    .slice(0, 8)
    .replace(/^[lI|!](?=1)/, '')
    .replace(/[lI|!]/g, '1')
    .replace(/\D/g, '')
    .slice(0, 4);
  // A CP never starts with 0: a leading 0 means the first digit was lost, so the read is unusable.
  return digits.length >= 2 && digits[0] !== '0' ? Number(digits) : undefined;
}

export function parseCommon(page: OcrPage): { cp?: number; nickname?: string; hp?: Hp } {
  const out: { cp?: number; nickname?: string; hp?: Hp } = {};
  for (const l of page.lines) {
    if (l.bbox.y0 > page.height * 0.12) continue;
    const cp = parseCpText(l.text);
    if (cp !== undefined) {
      out.cp = cp;
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

/**
 * Type words from the weight / type / height row. On appraisal frames the trainer covers part of it
 * ("FIRE / Gj IGHT"), so any line with a fragment of those labels counts.
 */
export function parseTypes(page: OcrPage): string[] | undefined {
  const found: string[] = [];
  for (const l of page.lines) {
    if (!/EIGHT|IGHT|HEAVIEST|LIGHTEST|TALLEST|SHORTEST/i.test(l.text)) continue;
    for (const w of l.text.toUpperCase().split(/[^A-Z]+/)) if (TYPES.includes(w) && !found.includes(w)) found.push(w);
  }
  return found.length ? found : undefined;
}

export function parseCandy(page: OcrPage): string | undefined {
  const line = page.lines.find(l => /STARDUST/i.test(l.text) && /CANDY/i.test(l.text));
  return line?.text
    .toUpperCase()
    .match(/STARDUST\s+(.+?)\s+CANDY/)?.[1]
    ?.trim();
}

const MOVE_WORD = /^[A-Za-z][A-Za-z'()-]{2,}$/;

function moveName(line: OcrLine): string | undefined {
  if (!/\d+(\s*\+\s*\d+)?\s*$/.test(line.text)) return undefined;
  const words = line.text.split(/\s+/);
  while (words.length && !MOVE_WORD.test(words[0])) words.shift();
  const name: string[] = [];
  for (const w of words) {
    if (!MOVE_WORD.test(w) || !/[a-z]/.test(w)) break;
    name.push(w[0].toUpperCase() + w.slice(1));
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
      const center = (w.bbox.x0 + w.bbox.x1) / 2;
      if (center > page.width * 0.94) continue; // scroll handle at the right edge
      const c = column(center, page.width);
      names.set(c, [...(names.get(c) ?? []), w.text]);
    }
    for (const [c, cp] of cps) {
      const name = cleanNickname((names.get(c) ?? []).join(' '));
      if (name) entries.push({ cp, name });
    }
  }
  return entries;
}

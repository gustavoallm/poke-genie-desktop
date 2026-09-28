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

import type { Ivs } from '../core/types.ts';

export type { Ivs };
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
  cp: number | null;
  cpReads: number[];
  /** pvpoke speciesId after CP/HP/IV consistency solving, e.g. "palkia_origin". */
  speciesId?: string;
  level?: number;
  /** Other forms with identical base stats that the screen could not rule out (e.g. Stunfisk vs Galarian Stunfisk). */
  formAlternatives?: string[];
  /** high: IVs, HP and an exact CP read agree with the formula; medium: solved after a correction or on partial CP evidence; low: unsolved. */
  confidence?: 'high' | 'medium' | 'low';
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

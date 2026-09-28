import type { InventoryPokemon, League, LeagueEval } from './types.ts';

export interface KeepRule {
  /** Keep this many of your best copies of a species per league. */
  keepCopies: number;
  /** Only species ranked this high by pvpoke in a league are worth keeping for it. */
  topSpecies: number;
}

export const DEFAULT_RULE: KeepRule = { keepCopies: 2, topSpecies: 100 };
export const LEAGUE_NAME: Record<League, string> = { great: 'Great League', ultra: 'Ultra League', master: 'Master League' };
export const LEAGUE_SHORT: Record<League, string> = { great: 'GL', ultra: 'UL', master: 'ML' };
/** Ball images in front/public; Master League has none yet. */
export const LEAGUE_ICON: Partial<Record<League, string>> = { great: '/great-ball.png', ultra: '/ultra-ball.png' };
const LEAGUE_ORDER: League[] = ['great', 'ultra', 'master'];

export interface Verdict {
  /** keep: worth keeping for at least one league · transfer: not needed · check: uncertain, look at it yourself. */
  kind: 'keep' | 'transfer' | 'check';
  keep: League[];
  reason: string;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export function verdict(p: InventoryPokemon, rule: KeepRule): Verdict {
  if (!p.speciesId) return { kind: 'check', keep: [], reason: 'Species not identified from the video: check it yourself' };
  // What this Pokémon can be: itself, or any of its final evolutions (same IVs).
  const forms = [
    { name: p.name, leagues: p.leagues, evolved: false },
    ...(p.evolutions ?? []).map(e => ({ name: e.name, leagues: e.leagues, evolved: true })),
  ];
  const good = (e: LeagueEval) => e.eligible && e.speciesRank !== undefined && e.speciesRank <= rule.topSpecies;
  const keepers = forms.flatMap(f =>
    LEAGUE_ORDER.filter(l => good(f.leagues[l]) && (f.leagues[l].copy?.position ?? Infinity) <= rule.keepCopies).map(l => ({ f, l })),
  );
  if (keepers.length) {
    const reason = keepers
      .map(({ f, l }) => {
        const e = f.leagues[l];
        const which = `${e.copy!.position === 1 ? 'best' : `${ordinal(e.copy!.position)}-best`} for ${LEAGUE_SHORT[l]} (#${e.speciesRank})`;
        return f.evolved ? `evolve into ${f.name}: ${which}` : which;
      })
      .join(' · ');
    return { kind: 'keep', keep: [...new Set(keepers.map(k => k.l))], reason };
  }
  if (p.confidence === 'low') return { kind: 'check', keep: [], reason: 'Low-confidence reading: check it yourself before transferring' };

  // The closest miss: a league where the species is good enough but this copy isn't among the best.
  for (const f of forms) {
    const l = LEAGUE_ORDER.find(x => good(f.leagues[x]) && f.leagues[x].copy);
    if (!l) continue;
    const c = f.leagues[l].copy!;
    return {
      kind: 'transfer',
      keep: [],
      reason: `${ordinal(c.position)}-best of your ${c.of} ${f.name} for ${LEAGUE_NAME[l]}${f.evolved ? ', once evolved' : ''} (keeping the top ${rule.keepCopies})`,
    };
  }
  return { kind: 'transfer', keep: [], reason: `Not in pvpoke's top ${rule.topSpecies} for any league it can play` };
}

export interface TransferGroup {
  speciesId: string;
  name: string;
  dex?: number;
  owned: number;
  transfer: Array<{ pokemon: InventoryPokemon; verdict: Verdict }>;
}

/** Transfer suggestions grouped by species, species with the most to transfer first. */
export function transferGroups(inventory: InventoryPokemon[], rule: KeepRule): TransferGroup[] {
  const groups = new Map<string, TransferGroup>();
  for (const p of inventory) {
    const id = p.speciesId ?? p.name;
    const g = groups.get(id) ?? { speciesId: id, name: p.name, dex: p.dex, owned: 0, transfer: [] };
    g.owned++;
    const v = verdict(p, rule);
    if (v.kind === 'transfer') g.transfer.push({ pokemon: p, verdict: v });
    groups.set(id, g);
  }
  return [...groups.values()]
    .filter(g => g.transfer.length)
    .sort((a, b) => b.transfer.length - a.transfer.length || a.name.localeCompare(b.name));
}

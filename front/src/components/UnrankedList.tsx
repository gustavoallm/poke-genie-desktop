import type { RankedPokemon } from '../types.ts';
import { Sprite } from './Sprite.tsx';

const REASON: Record<NonNullable<RankedPokemon['unrankedReason']>, string> = {
  'no-species': 'form not confirmed (CP unreadable)',
  'no-ivs': 'IVs not read',
  'not-in-rankings': "not in this league's rankings",
};

export function UnrankedList({ pokemon }: { pokemon: RankedPokemon[] }) {
  if (!pokemon.length) return null;
  return (
    <details className="unranked">
      <summary>{pokemon.length} not ranked</summary>
      <ul>
        {pokemon.map(p => (
          <li key={`${p.source}-${p.firstTimeSec}`}>
            <Sprite speciesId={p.speciesId ?? p.species?.toLowerCase() ?? null} name={p.species ?? ''} />
            <span className="name">{p.species ?? '?'}</span>
            {p.nickname && <span className="nick">{p.nickname}</span>}
            <span className="sub">
              CP {p.cp ?? '?'} · {p.unrankedReason ? REASON[p.unrankedReason] : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

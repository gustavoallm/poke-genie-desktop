import { useEffect, useRef, useState } from 'react';
import { moveLabel } from '../teams.ts';
import type { InventoryPokemon, League, LeagueEval } from '../types.ts';
import { LEAGUE_NAME, ordinal, verdict, type KeepRule } from '../verdict.ts';
import { Move } from './RankedTable.tsx';
import { Sprite } from './Sprite.tsx';
import { LeagueIcon, TypePill } from './ui.tsx';
import { RarityBadge } from './BoxView.tsx';

const CAPS: Record<League, number | null> = { great: 1500, ultra: 2500, master: null };
const LEAGUES: League[] = ['great', 'ultra', 'master'];

/** One league's standing: for the Pokémon as it is, or as one of its evolutions (same IVs and level). */
function LeagueCard({
  e,
  league,
  cp,
  level,
  name,
}: {
  e: LeagueEval;
  league: League;
  cp: number | null;
  level: number | null;
  name: string;
}) {
  const cap = CAPS[league];
  return (
    <section className={`league-card${e.eligible ? '' : ' off'}`}>
      <header>
        <h3>
          <LeagueIcon league={league} />
          {LEAGUE_NAME[league]}
        </h3>
        <span className="sub">{cap ? `CP ≤ ${cap}` : 'no CP cap'}</span>
      </header>
      {!e.eligible ? (
        <p className="sub">
          CP {cp} is above the {cap} cap: it can't be lowered.
        </p>
      ) : !e.ranked ? (
        <p className="sub">
          {e.unrankedReason === 'not-in-rankings' ? "Not in pvpoke's rankings for this league." : 'Not ranked (species or IVs missing).'}
        </p>
      ) : (
        <>
          <div className="league-stats">
            <div>
              <span className="stat-big">#{e.speciesRank}</span>
              <span className="sub">pvpoke · {e.speciesScore?.toFixed(1)}</span>
            </div>
            <div>
              <span className="stat-big">#{e.iv50?.rank}</span>
              <span className="sub">IV rank /4096 · {e.iv50?.statProductPct.toFixed(1)}%</span>
            </div>
            <div>
              <span className="stat-big">{e.copy?.position === 1 ? 'Best' : ordinal(e.copy?.position ?? 0)}</span>
              <span className="sub">
                of your {e.copy?.of} {name}
              </span>
            </div>
          </div>
          <p className="sub">
            {level != null && e.iv50 && level < e.iv50.level ? (
              <>
                Power up{' '}
                <strong>
                  L{level} → {e.iv50.level}
                </strong>
                {e.iv50.level > 40 ? ' (needs XL)' : ''} for CP {e.iv50.cp}
              </>
            ) : (
              <>
                Ready: CP {e.iv50?.cp} at L{e.iv50?.level}
              </>
            )}
            {e.iv51 && e.iv51.rank !== e.iv50?.rank && <> · best buddy IV rank #{e.iv51.rank}</>}
          </p>
          {e.recommendedMoves && (
            <p className="moves">
              <Move name={e.recommendedMoves.fast} />
              <span className="sep">/</span>
              <Move name={e.recommendedMoves.charged[0]} />
              <span className="sep">·</span>
              <Move name={e.recommendedMoves.charged[1]} />
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function Drawer({
  pokemon: p,
  rule,
  onClose,
  onSetForm,
}: {
  pokemon: InventoryPokemon;
  rule: KeepRule;
  onClose: () => void;
  onSetForm: (speciesId: string | null) => Promise<void>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const v = verdict(p, rule);
  const forms = p.formAlternatives ? [p.speciesId!, ...p.formAlternatives] : [];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickForm = async (id: string) => {
    setSaving(true);
    try {
      await onSetForm(id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${p.name} details`}>
        <button ref={closeRef} type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <header className="drawer-head">
          <Sprite speciesId={p.speciesId} dex={p.dex} name={p.name} />
          <div>
            <h2>
              {p.name}
              {p.nickname && p.nickname.toLowerCase() !== (p.species ?? '').toLowerCase() && <span className="nick">{p.nickname}</span>}
              {p.rarity && <RarityBadge rarity={p.rarity} />}
            </h2>
            <div className="pills">
              {(p.types ?? []).map(t => (
                <TypePill key={t} type={t} />
              ))}
            </div>
            <div className="sub">
              CP {p.cp ?? '?'} · {p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : 'IVs ?'} · L{p.level ?? '?'} ·{' '}
              <span className={`badge badge--${p.confidence}`}>{p.confidence}</span>
            </div>
          </div>
        </header>

        <div className={`verdict-banner ${v.kind}`}>
          <strong>{v.kind === 'keep' ? 'Keep' : v.kind === 'transfer' ? 'Transfer' : 'Check'}</strong>
          <span>{v.reason}</span>
        </div>

        {forms.length > 0 && (
          <section className="form-picker">
            <h3>Form {p.overridden ? <span className="sub">(set by you)</span> : <span className="form-flag">not confirmed</span>}</h3>
            <p className="sub">The video didn't show its types, and these forms have the same stats. Which one is it?</p>
            <div className="chip-grid">
              {forms.map(id => (
                <button
                  key={id}
                  type="button"
                  disabled={saving}
                  aria-pressed={id === p.speciesId}
                  className={`toggle-chip${id === p.speciesId ? ' on' : ''}`}
                  onClick={() => pickForm(id)}
                >
                  {moveLabel(id)}
                </button>
              ))}
            </div>
          </section>
        )}

        {LEAGUES.map(l => (
          <LeagueCard key={l} e={p.leagues[l]} league={l} cp={p.cp} level={p.level} name={p.name} />
        ))}

        {(p.evolutions ?? []).map(evo => (
          <section key={evo.speciesId} className="evolution">
            <h3 className="block-title">If evolved into {evo.name}</h3>
            <p className="sub">Same IVs and level: CP {evo.cpNow} right after evolving.</p>
            {LEAGUES.map(l => (
              <LeagueCard key={l} e={evo.leagues[l]} league={l} cp={evo.cpNow} level={p.level} name={evo.name} />
            ))}
          </section>
        ))}

        {p.moves && (
          <section className="league-card">
            <header>
              <h3>Moves it knows</h3>
              <span className="sub">from the video</span>
            </header>
            <p className="moves">{[p.moves.fast, ...p.moves.charged].join(' · ')}</p>
          </section>
        )}
        <p className="sub drawer-foot">From {p.source}</p>
      </aside>
    </div>
  );
}

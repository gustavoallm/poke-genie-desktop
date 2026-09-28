import { useEffect, useMemo, useRef, useState } from 'react';
import { generateTeams, pokemonKey } from '../api.ts';
import { lockOptions } from '../teams.ts';
import type { RankedFile, RankedPokemon, TeamsResult } from '../types.ts';
import type { ComboOption } from './comboboxMatch.ts';
import { Sprite } from './Sprite.tsx';
import { BeatenBar, IgnoreIvsToggle, MemberCard, STYLE_DEFAULT, StyleSlider, ThreatList } from './TeamParts.tsx';
import { Combobox, Heatmap, Section } from './ui.tsx';

export function TeamBuilderView({ file }: { file: RankedFile }) {
  const [locks, setLocks] = useState<Array<string | null>>([null, null]);
  const [style, setStyle] = useState(STYLE_DEFAULT);
  const [ignoreIvs, setIgnoreIvs] = useState(false);
  const [result, setResult] = useState<TeamsResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const byKey = useMemo(() => new Map(file.pokemon.map(p => [pokemonKey(p), p])), [file]);
  const options: ComboOption[] = useMemo(
    () =>
      lockOptions(file.pokemon).map(o => {
        const best = file.pokemon.find(p => p.speciesId === o.speciesId);
        return {
          value: o.speciesId,
          label: o.name,
          sub: best?.speciesRank ? `pvpoke #${best.speciesRank}` : undefined,
          speciesId: o.speciesId,
          dex: best?.dex,
        };
      }),
    [file],
  );

  // Regenerate shortly after any setting changes; stale responses are ignored.
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      generateTeams(
        file.league,
        locks.filter((l): l is string => !!l),
        style,
        ignoreIvs,
      )
        .then(r => {
          if (id === requestId.current) {
            setResult(r);
            setSelected(0);
          }
        })
        .catch((e: Error) => {
          if (id === requestId.current) setError(e.message);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [file.league, locks, style, ignoreIvs]);

  const team = result?.teams[selected];
  const setLock = (i: number, v: string | null) => setLocks(ls => ls.map((l, k) => (k === i ? v : l)));

  return (
    <>
      <aside className="view-controls" aria-label="Team builder settings">
        <Section title="Build around">
          <p className="field-hint">Lock up to 2 Pokémon; the rest of the team is filled around them.</p>
          {[0, 1].map(i => (
            <Combobox
              key={i}
              label={`Locked Pokémon ${i + 1}`}
              placeholder="Any Pokémon…"
              value={locks[i]}
              options={options.filter(o => !locks.includes(o.value) || locks[i] === o.value)}
              onChange={v => setLock(i, v)}
            />
          ))}
        </Section>
        <Section title="Scoring">
          <StyleSlider value={style} onChange={setStyle} />
          <IgnoreIvsToggle value={ignoreIvs} onChange={setIgnoreIvs} />
        </Section>
        {result && (
          <p className="field-hint side-note">
            {result.candidates} of your Pokémon (best copy per species) vs pvpoke's top {result.meta.length}, at 0, 1 and 2 shields.
          </p>
        )}
      </aside>

      <section className="view-main">
        <header className="view-head">
          <div>
            <h1>Team builder</h1>
            <p className="meta">{loading ? 'Simulating battles…' : result ? `Top ${result.teams.length} teams from your box` : ''}</p>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {result && !result.teams.length && !loading && <p className="none">No team fits these locks.</p>}
        {result && team && (
          <div className={loading ? 'builder loading' : 'builder'}>
            <ol className="team-list" aria-label="Teams">
              {result.teams.map((t, i) => (
                <li key={t.members.map(m => m.candidate.key).join('|')}>
                  <button
                    type="button"
                    className={i === selected ? 'team-row on' : 'team-row'}
                    aria-current={i === selected}
                    onClick={() => setSelected(i)}
                  >
                    <span className="team-rank">#{i + 1}</span>
                    <span className="team-sprites">
                      {t.members.map(m => (
                        <Sprite key={m.candidate.key} speciesId={m.candidate.speciesId} dex={m.candidate.dex} name={m.candidate.name} />
                      ))}
                    </span>
                    <span className="team-names">{t.members.map(m => m.candidate.name).join(' · ')}</span>
                    <span className="rating-pill">{t.rating}</span>
                  </button>
                </li>
              ))}
            </ol>
            <TeamDetail team={team} meta={result.meta} byKey={byKey} />
          </div>
        )}
      </section>
    </>
  );
}

export function TeamDetail({
  team,
  meta,
  byKey,
}: {
  team: TeamsResult['teams'][number];
  meta: TeamsResult['meta'];
  byKey: Map<string, RankedPokemon>;
}) {
  return (
    <article className="team-detail">
      <header className="team-detail-head">
        <div className="rating-big" title="0-100 blend of matchup coverage and proven species strength, relative to your other teams">
          {team.rating}
          <small>/100</small>
        </div>
        <div className="team-stats">
          <BeatenBar value={team.beaten} />
          <span className="sub">
            coverage {team.coverage} · avg pvpoke score {team.strength}
          </span>
        </div>
      </header>
      <div className="member-grid">
        {team.members.map(m => (
          <MemberCard key={m.candidate.key} member={m} pokemon={byKey.get(m.candidate.key)} />
        ))}
      </div>
      <h3 className="block-title">Matchups vs the meta</h3>
      <Heatmap meta={meta} matchups={team.matchups} members={team.members.map(m => ({ label: m.candidate.name, sub: m.role }))} />
      <h3 className="block-title">Biggest threats</h3>
      <ThreatList threats={team.threats} />
    </article>
  );
}

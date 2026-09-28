import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeTeam, pokemonKey } from '../api.ts';
import type { AnalyzeResult, RankedFile } from '../types.ts';
import type { ComboOption } from './comboboxMatch.ts';
import { Sprite } from './Sprite.tsx';
import { BeatenBar, IgnoreIvsToggle, MemberCard, STYLE_DEFAULT, StyleSlider, ThreatList } from './TeamParts.tsx';
import { Combobox, Heatmap, Section } from './ui.tsx';

const SLOTS = ['Pokémon 1', 'Pokémon 2', 'Pokémon 3'];
const storageKey = (league: string) => `myteam:${league}`;

/** A team in the URL (?team=key1,key2,key3) wins over the remembered one, so a link reopens it. */
function loadSlots(league: string): Array<string | null> {
  const fromUrl = new URLSearchParams(window.location.search).get('team')?.split(',');
  if (fromUrl?.length === 3) return fromUrl;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(league)) ?? 'null');
    if (Array.isArray(saved) && saved.length === 3) return saved;
  } catch {
    /* storage unavailable */
  }
  return [null, null, null];
}

export function MyTeamView({ file }: { file: RankedFile }) {
  const [slots, setSlots] = useState<Array<string | null>>(() => loadSlots(file.league));
  const [style, setStyle] = useState(STYLE_DEFAULT);
  const [ignoreIvs, setIgnoreIvs] = useState(false);
  const [report, setReport] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSlots(loadSlots(file.league));
  }, [file.league]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(file.league), JSON.stringify(slots));
    } catch {
      /* storage unavailable */
    }
  }, [file.league, slots]);

  const byKey = useMemo(() => new Map(file.pokemon.map(p => [pokemonKey(p), p])), [file]);
  const options: ComboOption[] = useMemo(
    () =>
      file.pokemon
        .filter(p => p.ranked && p.speciesId && p.iv50)
        .sort((a, b) => (a.csvName ?? '').localeCompare(b.csvName ?? '') || a.iv50!.rank - b.iv50!.rank)
        .map(p => ({
          value: pokemonKey(p),
          label: `${p.csvName ?? p.species ?? '?'}${p.evolvesFrom ? ` (evolve ${p.evolvesFrom.name})` : ''}`,
          speciesId: p.speciesId,
          dex: p.dex,
          sub: `CP ${p.cp} · ${p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?'} · IV #${p.iv50!.rank}${p.nickname ? ` · ${p.nickname}` : ''}`,
        })),
    [file],
  );

  const chosen = slots.filter((s): s is string => !!s);
  useEffect(() => {
    if (chosen.length !== 3) {
      setReport(null);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      analyzeTeam(file.league, chosen, style, ignoreIvs)
        .then(r => {
          if (id === requestId.current) setReport(r);
        })
        .catch((e: Error) => {
          if (id === requestId.current) {
            setReport(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [file.league, slots, style, ignoreIvs]);

  // A species can only be picked once: hide other copies of species already in another slot.
  const speciesOf = (key: string | null) => (key ? byKey.get(key)?.speciesId : undefined);
  const optionsFor = (i: number) => options.filter(o => !slots.some((s, k) => k !== i && speciesOf(s) === o.speciesId));
  const setSlot = (i: number, v: string | null) => setSlots(s => s.map((x, k) => (k === i ? v : x)));
  const applySwap = (from: string, to: string) => setSlots(s => s.map(x => (x === from ? to : x)));

  return (
    <>
      <aside className="view-controls" aria-label="My team settings">
        <Section title="Scoring">
          <StyleSlider value={style} onChange={setStyle} />
          <IgnoreIvsToggle value={ignoreIvs} onChange={setIgnoreIvs} />
        </Section>
        <p className="field-hint side-note">
          Pick the exact Pokémon you use (which copy matters: IVs and level). Your picks are remembered per league.
        </p>
      </aside>

      <section className="view-main">
        <header className="view-head">
          <div>
            <h1>My team</h1>
            <p className="meta">{loading ? 'Analyzing…' : chosen.length < 3 ? `Pick ${3 - chosen.length} more Pokémon` : ''}</p>
          </div>
        </header>

        <div className="slot-grid">
          {SLOTS.map((label, i) => (
            <div key={label} className={slots[i] ? 'slot filled' : 'slot'}>
              <div className="slot-label">{report?.team.members.find(m => m.candidate.key === slots[i])?.role ?? label}</div>
              <Combobox
                label={label}
                placeholder="Search your Pokémon…"
                value={slots[i]}
                options={optionsFor(i)}
                onChange={v => setSlot(i, v)}
              />
            </div>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {report && (
          <div className={loading ? 'report loading' : 'report'}>
            <article className="verdict">
              <div className="rating-big">
                {report.team.rating}
                <small>/100</small>
              </div>
              <div className="team-stats">
                <strong>
                  #{report.rank.toLocaleString()} of {report.totalTeams.toLocaleString()}
                </strong>
                <span className="sub"> teams you could build from your box</span>
                <BeatenBar value={report.team.beaten} />
                <span className="sub">
                  coverage {report.team.coverage} · avg pvpoke score {report.team.strength}
                  {report.weakestSlot && (
                    <>
                      {' '}
                      · weakest slot: <strong>{report.weakestSlot}</strong>
                    </>
                  )}
                </span>
              </div>
            </article>

            <div className="member-grid">
              {report.team.members.map(m => (
                <MemberCard key={m.candidate.key} member={m} pokemon={byKey.get(m.candidate.key)} />
              ))}
            </div>

            <h3 className="block-title">Matchups vs the meta</h3>
            <Heatmap
              meta={report.meta}
              matchups={report.team.matchups}
              members={report.team.members.map(m => ({ label: m.candidate.name, sub: m.role }))}
            />

            <h3 className="block-title">Biggest threats</h3>
            <ThreatList threats={report.team.threats} />

            <h3 className="block-title">Improve it</h3>
            {report.swaps.length === 0 && <p className="none">No single swap from your box improves this team.</p>}
            <ul className="swap-list">
              {report.swaps.map(s => (
                <li key={`${s.from.key}-${s.to.key}`}>
                  <span className="swap-mons">
                    <Sprite speciesId={s.from.speciesId} dex={s.from.dex} name={s.from.name} />
                    <span className="arrow">→</span>
                    <Sprite speciesId={s.to.speciesId} dex={s.to.dex} name={s.to.name} />
                  </span>
                  <span className="swap-text">
                    <strong>
                      {s.from.name} → {s.to.name}
                    </strong>{' '}
                    <span className="sub">({s.slot})</span>
                    {s.fixes.length > 0 && <span className="sub"> · answers {s.fixes.join(', ')}</span>}
                  </span>
                  <span className="delta">+{s.delta}</span>
                  <button type="button" className="btn btn-sm" onClick={() => applySwap(s.from.key, s.to.key)}>
                    Try it
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

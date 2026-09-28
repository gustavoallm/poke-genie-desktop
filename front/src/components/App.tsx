import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchInventory, fetchLeagues, fetchRanked, setForm } from '../api.ts';
import { AppContext } from '../appContext.ts';
import type { Inventory, League, RankedFile } from '../types.ts';
import { DEFAULT_RULE, LEAGUE_NAME, type KeepRule } from '../verdict.ts';
import { BoxView } from './BoxView.tsx';
import { Drawer } from './Drawer.tsx';
import { MyTeamView } from './MyTeamView.tsx';
import { RankingsView } from './RankingsView.tsx';
import { TeamBuilderView } from './TeamBuilderView.tsx';
import { LeagueIcon, Segmented } from './ui.tsx';

type View = 'rankings' | 'teams' | 'myteam' | 'box';
const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: 'rankings', label: 'My rankings', hint: 'Your Pokémon ranked for the league' },
  { id: 'teams', label: 'Team builder', hint: 'Best teams from your box' },
  { id: 'myteam', label: 'My team', hint: 'Analyze the 3 you use' },
  { id: 'box', label: 'My box', hint: 'Keep or transfer, all leagues' },
];
const LEAGUE_SHORT: Record<League, string> = { great: 'Great', ultra: 'Ultra', master: 'Master' };

const viewFromHash = (): View => {
  const h = window.location.hash.slice(1);
  return VIEWS.some(v => v.id === h) ? (h as View) : 'rankings';
};

export function App() {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [league, setLeague] = useState<League>();
  const [file, setFile] = useState<RankedFile | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(viewFromHash);
  const [rule, setRule] = useState<KeepRule>(DEFAULT_RULE);
  // ?pokemon=<key> opens the drawer on one Pokémon, so a link can point straight at it.
  const [drawerKey, setDrawerKey] = useState<string | null>(() => new URLSearchParams(window.location.search).get('pokemon'));

  const setView = (v: View) => {
    setViewState(v);
    history.replaceState(null, '', v === 'rankings' ? window.location.pathname : `#${v}`);
  };

  useEffect(() => {
    fetchLeagues()
      .then(list => {
        setLeagues(list);
        setLeague(current => current ?? (list.includes('ultra') ? 'ultra' : list[0]));
      })
      .catch((e: Error) => setError(e.message));
    fetchInventory()
      .then(setInventory)
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadLeague = useCallback((l: League) => {
    fetchRanked(l)
      .then(setFile)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (league) {
      setFile(null);
      loadLeague(league);
    }
  }, [league, loadLeague]);

  const byKey = useMemo(() => new Map((inventory?.pokemon ?? []).map(p => [p.key, p])), [inventory]);
  const context = useMemo(() => ({ openPokemon: setDrawerKey, byKey, rule }), [byKey, rule]);
  const drawerPokemon = drawerKey ? byKey.get(drawerKey) : undefined;

  // Tab title follows the page you are on, e.g. "Team builder · Ultra League | Poke Genie".
  useEffect(() => {
    const page = VIEWS.find(v => v.id === view)!.label;
    const where = view !== 'box' && league ? ` · ${LEAGUE_NAME[league]}` : '';
    document.title = `${page}${where} | Poke Genie`;
  }, [view, league]);

  /** After a form change, reload everything that depends on it. */
  const onSetForm = async (speciesId: string | null) => {
    if (!drawerKey) return;
    await setForm(drawerKey, speciesId);
    const [inv] = await Promise.all([fetchInventory(), league ? fetchRanked(league).then(setFile) : Promise.resolve()]);
    setInventory(inv);
  };

  if (error) {
    return (
      <main className="message-page">
        <h1>Poke Genie Desktop</h1>
        <p>Couldn't load data from the API: {error}</p>
        <p>
          Is it running? Start everything with <code>npm run dev</code> from the project folder.
        </p>
      </main>
    );
  }
  if (leagues && !leagues.length) {
    return (
      <main className="message-page">
        <h1>Poke Genie Desktop</h1>
        <p>
          No Pokémon yet. Extract a video with <code>npm run extract -- samples/&lt;video&gt;.mp4</code> and reload.
        </p>
      </main>
    );
  }

  const main =
    view === 'box' ? (
      inventory ? (
        <BoxView inventory={inventory} rule={rule} onRuleChange={setRule} />
      ) : null
    ) : !file ? null : view === 'rankings' ? (
      <RankingsView key={file.league} file={file} />
    ) : view === 'teams' ? (
      <TeamBuilderView key={file.league} file={file} />
    ) : (
      <MyTeamView key={file.league} file={file} />
    );

  return (
    <AppContext.Provider value={context}>
      <div className="app">
        <nav className="sidebar-nav" aria-label="Main">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Poke Genie
          </div>
          {leagues && league && view !== 'box' && (
            <Segmented
              label="League"
              value={league}
              onChange={setLeague}
              options={leagues.map(l => ({
                value: l,
                label: (
                  <>
                    <LeagueIcon league={l} />
                    {LEAGUE_SHORT[l]}
                  </>
                ),
                title: LEAGUE_NAME[l],
              }))}
            />
          )}
          <ul className="view-nav">
            {VIEWS.map(v => (
              <li key={v.id}>
                <button
                  type="button"
                  className={v.id === view ? 'on' : undefined}
                  aria-current={v.id === view ? 'page' : undefined}
                  onClick={() => setView(v.id)}
                >
                  <span>{v.label}</span>
                  <small>{v.hint}</small>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {main ?? (
          <section className="view-main">
            <p className="meta">Loading…</p>
          </section>
        )}
      </div>
      {drawerPokemon && <Drawer pokemon={drawerPokemon} rule={rule} onClose={() => setDrawerKey(null)} onSetForm={onSetForm} />}
    </AppContext.Provider>
  );
}

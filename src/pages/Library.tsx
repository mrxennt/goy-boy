import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, GAMES, SORT_OPTIONS, getGame, sortGames, type GameMeta, type SortId } from '../data/games';
import { GameCard } from '../components/GameCard';
import { Link, navigate, useRoute } from '../lib/router';
import { useAppState } from '../lib/store';

type Mode = 'all' | 'favorites' | 'recent';

const TITLES: Record<Mode, { title: string; sub: string }> = {
  all: { title: 'Alle Spiele', sub: 'Die komplette GOY BOY Bibliothek – sofort spielbar.' },
  favorites: { title: 'Favoriten', sub: 'Deine gemerkten Spiele, immer griffbereit.' },
  recent: { title: 'Zuletzt gespielt', sub: 'Mach da weiter, wo du aufgehört hast.' },
};

export function Library({ mode }: { mode: Mode }) {
  const route = useRoute();
  const state = useAppState();
  const [query, setQuery] = useState(route.query.get('q') ?? '');
  const activeCategory = route.query.get('cat') ?? 'Alle';
  const sort = (route.query.get('sort') as SortId) || 'popular';

  useEffect(() => {
    setQuery(route.query.get('q') ?? '');
  }, [route.path, route.search]);

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(route.search);
    if (!value) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    navigate(`/games${qs ? `?${qs}` : ''}`, { replace: true });
  };

  const base = useMemo<GameMeta[]>(() => {
    if (mode === 'favorites') {
      return state.favorites.map((id) => getGame(id)).filter((g): g is GameMeta => Boolean(g));
    }
    if (mode === 'recent') {
      return Array.from(new Set(state.history.map((h) => h.id)))
        .map((id) => getGame(id))
        .filter((g): g is GameMeta => Boolean(g));
    }
    return GAMES;
  }, [mode, state.favorites, state.history]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = base.filter((game) => {
      if (mode === 'all' && activeCategory !== 'Alle' && game.category !== activeCategory) return false;
      if (!needle) return true;
      return (
        game.name.toLowerCase().includes(needle) ||
        game.desc.toLowerCase().includes(needle) ||
        game.category.toLowerCase().includes(needle) ||
        game.tags.some((tag) => tag.includes(needle))
      );
    });
    if (mode === 'all') list = sortGames(list, sort);
    return list;
  }, [base, query, activeCategory, sort, mode]);

  const heading = TITLES[mode];

  return (
    <div className="page library">
      <header className="page-head">
        <span className="eyebrow">{results.length} Spiele</span>
        <h1>{heading.title}</h1>
        <p className="page-sub">{heading.sub}</p>
      </header>

      <div className="filter-bar">
        <div className="search-field">
          <span aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Nach Name, Kategorie oder Tag suchen…"
            value={query}
            aria-label="Spiele filtern"
            onChange={(event) => {
              setQuery(event.target.value);
              if (mode === 'all') updateParam('q', event.target.value || null);
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                if (mode === 'all') updateParam('q', null);
              }}
              aria-label="Suche leeren"
            >
              ✕
            </button>
          ) : null}
        </div>

        {mode === 'all' ? (
          <label className="sort-field">
            <span>Sortieren</span>
            <select value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {mode === 'all' ? (
        <div className="chip-row" role="group" aria-label="Kategorie filtern">
          <button
            type="button"
            className={`chip ${activeCategory === 'Alle' ? 'is-active' : ''}`}
            onClick={() => updateParam('cat', null)}
          >
            Alle
            <small>{GAMES.length}</small>
          </button>
          {CATEGORIES.map((category) => {
            const count = GAMES.filter((game) => game.category === category.id).length;
            return (
              <button
                key={category.id}
                type="button"
                className={`chip ${activeCategory === category.id ? 'is-active' : ''}`}
                onClick={() => updateParam('cat', category.id)}
              >
                <span aria-hidden>{category.icon}</span>
                {category.label}
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      ) : null}

      {results.length ? (
        <div className="game-grid">
          {results.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden>
            {mode === 'favorites' ? '💜' : mode === 'recent' ? '🕒' : '🔍'}
          </span>
          <h2>Nichts gefunden</h2>
          <p className="muted">
            {mode === 'favorites'
              ? 'Du hast noch keine Favoriten. Klicke auf das Herz einer Spielekarte, um sie hier zu sammeln.'
              : mode === 'recent'
                ? 'Dein Verlauf ist noch leer. Starte ein Spiel und es erscheint hier.'
                : 'Für diese Suche gibt es keine Treffer. Versuche einen anderen Begriff oder eine andere Kategorie.'}
          </p>
          <Link to="/games" className="btn btn-primary">
            Alle Spiele ansehen
          </Link>
        </div>
      )}
    </div>
  );
}

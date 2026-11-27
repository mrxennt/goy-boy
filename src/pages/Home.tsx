import { useMemo, useState } from 'react';
import {
  CATEGORIES,
  FEATURED_ID,
  GAMES,
  byCategory,
  byTag,
  getGame,
  sortGames,
  type GameMeta,
} from '../data/games';
import { GameRow } from '../components/GameRow';
import { FavoriteButton } from '../components/FavoriteButton';
import { Link, navigate } from '../lib/router';
import { levelOf, useAppState } from '../lib/store';
import { choice } from '../lib/utils';
import { sfx } from '../lib/sound';

export function Home() {
  const state = useAppState();
  const featured = getGame(FEATURED_ID) ?? GAMES[0];
  const [randomPick, setRandomPick] = useState<GameMeta>(() => choice(GAMES));
  const [spinning, setSpinning] = useState(false);

  const popular = useMemo(() => sortGames(GAMES, 'popular').slice(0, 10), []);
  const fresh = useMemo(() => sortGames(GAMES, 'new').slice(0, 10), []);
  const recommended = useMemo(() => {
    const favCategories = new Set(state.favorites.map((id) => getGame(id)?.category));
    const playedCategories = new Set(state.played.map((id) => getGame(id)?.category));
    const scored = GAMES.filter((game) => !state.favorites.includes(game.id)).map((game) => {
      let score = game.popularity / 10;
      if (favCategories.has(game.category)) score += 6;
      if (playedCategories.has(game.category)) score += 2;
      return { game, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.game);
  }, [state.favorites, state.played]);

  const continuePlaying = useMemo(
    () =>
      Array.from(new Set(state.history.map((h) => h.id)))
        .map((id) => getGame(id))
        .filter((game): game is GameMeta => Boolean(game))
        .slice(0, 10),
    [state.history],
  );

  const spin = () => {
    sfx.pick();
    setSpinning(true);
    const pool = GAMES.filter((game) => game.id !== randomPick.id);
    window.setTimeout(() => {
      setRandomPick(choice(pool));
      setSpinning(false);
    }, 260);
  };

  const greeting = state.profile.name?.trim() ? state.profile.name.trim() : 'Player One';

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-visual" aria-hidden>
          <div className="hero-ring" />
          <div className="hero-ring hero-ring-2" />
          <div className="hero-tile" />
          <div className="hero-glow" />
          <div className="hero-float float-a">◆</div>
          <div className="hero-float float-b">▲</div>
          <div className="hero-float float-c">●</div>
        </div>

        <div className="hero-copy">
          <span className="eyebrow">Browser-Gaming-Plattform</span>
          <h1 className="hero-title">
            GOY<span>BOY</span>
          </h1>
          <p className="hero-lead">
            Hallo <b>{greeting}</b> – {GAMES.length} Spiele, ein Klick. Kein Download, keine Anmeldung, keine
            Wartezeit. Level {levelOf(state.xp)} ist gespeichert.
          </p>

          <div className="hero-actions">
            <Link to={`/game/${featured.id}`} className="btn btn-primary btn-lg hero-play">
              <span aria-hidden>▶</span> Jetzt spielen
            </Link>
            <Link to="/games" className="btn btn-outline btn-lg">
              Spielebibliothek
            </Link>
          </div>

          <div className="hero-stats">
            <div>
              <b>{GAMES.length}</b>
              <span>Spiele</span>
            </div>
            <div>
              <b>{CATEGORIES.length}</b>
              <span>Kategorien</span>
            </div>
            <div>
              <b>{state.achievements.length}</b>
              <span>Erfolge</span>
            </div>
            <div>
              <b>0 €</b>
              <span>Kostenlos</span>
            </div>
          </div>
        </div>

        <div className="hero-featured">
          <div className="featured-card">
            <div
              className="featured-art"
              style={{ ['--from' as string]: featured.from, ['--to' as string]: featured.to }}
            >
              <span className="featured-badge">★ Featured</span>
              <span className="featured-icon" aria-hidden>
                {featured.icon}
              </span>
              <span className="featured-scan" aria-hidden />
            </div>
            <div className="featured-info">
              <div className="featured-info-head">
                <div>
                  <p className="featured-cat">{featured.category}</p>
                  <h2>{featured.name}</h2>
                </div>
                <FavoriteButton gameId={featured.id} />
              </div>
              <p className="featured-desc">{featured.desc}</p>
              <div className="featured-foot">
                <Link to={`/game/${featured.id}`} className="btn btn-primary">
                  ▶ Spielen
                </Link>
                <span className="muted tiny">{featured.controls}</span>
              </div>
            </div>
          </div>

          <div className={`random-card ${spinning ? 'is-spinning' : ''}`}>
            <div className="random-icon" aria-hidden>
              {randomPick.icon}
            </div>
            <div className="random-copy">
              <p className="random-kicker">Zufälliges Spiel</p>
              <b>{randomPick.name}</b>
              <small>{randomPick.category}</small>
            </div>
            <div className="random-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={spin}>
                🎲 Auslosen
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/game/${randomPick.id}`)}
              >
                Play
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="category-strip" aria-label="Kategorien">
        {CATEGORIES.map((category) => (
          <Link key={category.id} to={`/games?cat=${encodeURIComponent(category.id)}`} className="category-pill">
            <span aria-hidden>{category.icon}</span>
            {category.label}
            <small>{byCategory(category.id).length}</small>
          </Link>
        ))}
      </section>

      {continuePlaying.length ? (
        <GameRow title="Weiterspielen" subtitle="Deine letzten Sessions" games={continuePlaying} moreTo="/recent" />
      ) : null}

      <GameRow title="Beliebte Spiele" subtitle="Was gerade am häufigsten gespielt wird" games={popular} moreTo="/games" />
      <GameRow
        title="Neu hinzugefügt"
        subtitle="Frisch in der Bibliothek"
        games={fresh}
        moreTo="/games?sort=new"
        moreLabel="Neuheiten"
      />
      <GameRow
        title="Für dich empfohlen"
        subtitle="Basierend auf deinen Favoriten und deinem Verlauf"
        games={recommended}
        moreTo="/games?sort=popular"
      />
      <GameRow title="Multiplayer" subtitle="Zwei Spieler, ein Gerät" games={byCategory('Multiplayer')} moreTo="/games?cat=Multiplayer" />
      <GameRow title="Puzzle & Denkspiele" games={byCategory('Puzzle')} moreTo="/games?cat=Puzzle" />
      <GameRow title="Action & Arcade" games={byCategory('Arcade')} moreTo="/games?cat=Arcade" />
      <GameRow title="Strategie" games={byCategory('Strategie')} moreTo="/games?cat=Strategie" />
      <GameRow title="Racing" games={byCategory('Racing')} moreTo="/games?cat=Racing" />
      <GameRow title="Sport" games={byCategory('Sport')} moreTo="/games?cat=Sport" />
      <GameRow title="Klassiker" subtitle="Die Spiele, mit denen alles begann" games={byTag('klassiker')} moreTo="/games?sort=popular" />
    </div>
  );
}

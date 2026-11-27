import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { GAMES, getGame, sortGames, type GameMeta } from '../data/games';
import { gameLoaders } from '../games/loaders';
import { useGame } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import { useAppState } from '../lib/store';
import { FavoriteButton } from '../components/FavoriteButton';
import { GameCard } from '../components/GameCard';
import { formatDuration, formatNumber } from '../lib/utils';
import { sfx } from '../lib/sound';

export function Player({ id }: { id: string }) {
  const game = getGame(id);
  if (!game) {
    return (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon" aria-hidden>
            🕳️
          </span>
          <h2>Spiel nicht gefunden</h2>
          <p className="muted">Dieses Spiel existiert nicht (mehr). Die Bibliothek hat 25 andere.</p>
          <Link to="/games" className="btn btn-primary">
            Zur Bibliothek
          </Link>
        </div>
      </div>
    );
  }
  return <GameView key={game.id} game={game} />;
}

function GameView({ game }: { game: GameMeta }) {
  const session = useGame(game.id);
  const state = useAppState();
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const GameComponent = useMemo(() => lazy(gameLoaders[game.id]), [game.id]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fullscreen) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggleFullscreen = async () => {
    sfx.click();
    try {
      if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen(false);
    }
  };

  const similar = useMemo(() => {
    const sameCategory = GAMES.filter((g) => g.id !== game.id && g.category === game.category);
    const fill = sortGames(
      GAMES.filter((g) => g.id !== game.id && g.category !== game.category),
      'popular',
    );
    return [...sameCategory, ...fill].slice(0, 5);
  }, [game.id, game.category]);

  const record = state.records[game.id];

  return (
    <div className="page player-page">
      <div className="player-top">
        <div className="player-top-left">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/games')}>
            ← Zurück
          </button>
          <span className={`badge-cat cat-${game.category.toLowerCase()}`}>{game.category}</span>
        </div>
        <div className="player-top-right">
          <FavoriteButton gameId={game.id} label />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void toggleFullscreen()}>
            {fullscreen ? '⤢ Vollbild verlassen' : '⤢ Vollbild'}
          </button>
        </div>
      </div>

      <header className="player-head">
        <h1>
          <span aria-hidden>{game.icon}</span> {game.name}
        </h1>
        <p className="muted">{game.desc}</p>
      </header>

      <div className={`player-stage ${fullscreen ? 'is-fullscreen' : ''}`} ref={stageRef}>
        <Suspense
          fallback={
            <div className="stage-loading">
              <span className="spinner" aria-hidden />
              <p>Spiel wird geladen…</p>
            </div>
          }
        >
          <GameComponent session={session} game={game} />
        </Suspense>
      </div>

      <div className="player-info">
        <section className="panel player-about">
          <h2>Über das Spiel</h2>
          <p>{game.long}</p>
          <div className="meta-grid">
            <div>
              <span>Kategorie</span>
              <b>{game.category}</b>
            </div>
            <div>
              <span>Modus</span>
              <b>{game.multiplayer ? '2 Spieler lokal' : 'Solo'}</b>
            </div>
            <div>
              <span>Steuerung</span>
              <b>{game.controls}</b>
            </div>
            <div>
              <span>Bestwert</span>
              <b>{record?.best ? formatNumber(record.best) : '—'}</b>
            </div>
            <div>
              <span>Runden</span>
              <b>{record?.plays ?? 0}</b>
            </div>
            <div>
              <span>Spielzeit</span>
              <b>{formatDuration(record?.ms ?? 0)}</b>
            </div>
          </div>
        </section>

        <aside className="panel player-tips">
          <h2>Steuerung</h2>
          <p className="controls-line">{game.controls}</p>
          <ul className="tip-list">
            <li>Pause und Neustart findest du direkt über dem Spielfeld.</li>
            <li>Dein Rekord wird automatisch gespeichert.</li>
            <li>Vollbild nutzt den ganzen Bildschirm – ESC führt zurück.</li>
          </ul>
        </aside>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Ähnliche Spiele</h2>
          <Link to={`/games?cat=${encodeURIComponent(game.category)}`} className="section-more">
            Mehr in {game.category} →
          </Link>
        </div>
        <div className="game-grid">
          {similar.map((item, index) => (
            <GameCard key={item.id} game={item} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

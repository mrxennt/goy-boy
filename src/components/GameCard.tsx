import { Link } from '../lib/router';
import type { GameMeta } from '../data/games';
import { useAppState } from '../lib/store';
import { FavoriteButton } from './FavoriteButton';
import { formatNumber } from '../lib/utils';

type Props = {
  game: GameMeta;
  size?: 'default' | 'wide';
  index?: number;
};

export function GameCard({ game, size = 'default', index }: Props) {
  const { records } = useAppState();
  const best = records[game.id]?.best ?? 0;

  return (
    <article className={`game-card ${size === 'wide' ? 'is-wide' : ''}`} style={{ animationDelay: `${Math.min(index ?? 0, 8) * 40}ms` }}>
      <Link
        to={`/game/${game.id}`}
        className="card-cover"
        aria-label={`${game.name} spielen`}
        style={{ ['--from' as string]: game.from, ['--to' as string]: game.to }}
      >
        <span className="cover-grid" aria-hidden />
        <span className="cover-icon" aria-hidden>
          {game.icon}
        </span>
        <span className="cover-tag">{game.category}</span>
        {best > 0 ? <span className="cover-best">★ {formatNumber(best)}</span> : null}
        <span className="cover-play" aria-hidden>
          ▶
        </span>
      </Link>

      <div className="card-body">
        <div className="card-title-row">
          <h3>
            <Link to={`/game/${game.id}`}>{game.name}</Link>
          </h3>
          <FavoriteButton gameId={game.id} />
        </div>
        <p className="card-desc">{game.desc}</p>
        <div className="card-foot">
          <span className="card-meta">
            {game.multiplayer ? '👥 2 Spieler' : game.score ? '🏆 Highscore' : '🧠 Solo'}
          </span>
          <Link to={`/game/${game.id}`} className="btn btn-sm btn-primary">
            Spielen
          </Link>
        </div>
      </div>
    </article>
  );
}

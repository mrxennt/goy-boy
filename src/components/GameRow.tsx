import { useRef } from 'react';
import type { GameMeta } from '../data/games';
import { GameCard } from './GameCard';
import { Link } from '../lib/router';

type Props = {
  title: string;
  subtitle?: string;
  games: GameMeta[];
  moreTo?: string;
  moreLabel?: string;
  wide?: boolean;
};

export function GameRow({ title, subtitle, games, moreTo, moreLabel = 'Alle ansehen', wide = false }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!games.length) return null;

  const scrollBy = (direction: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(280, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="section-sub">{subtitle}</p> : null}
        </div>
        <div className="section-tools">
          <button type="button" className="scroll-btn" onClick={() => scrollBy(-1)} aria-label="Nach links scrollen">
            ‹
          </button>
          <button type="button" className="scroll-btn" onClick={() => scrollBy(1)} aria-label="Nach rechts scrollen">
            ›
          </button>
          {moreTo ? (
            <Link to={moreTo} className="section-more">
              {moreLabel} →
            </Link>
          ) : null}
        </div>
      </div>
      <div className={`game-row ${wide ? 'is-wide' : ''}`} ref={scroller}>
        {games.map((game, index) => (
          <GameCard key={game.id} game={game} index={index} size={wide ? 'wide' : 'default'} />
        ))}
      </div>
    </section>
  );
}

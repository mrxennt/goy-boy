import { Link } from '../lib/router';
import { dailyGameFor, dateKey, prettyDate } from '../lib/daily';
import { currentStreak, dailyResult, useAppState } from '../lib/store';
import { formatNumber } from '../lib/utils';
import { sfx } from '../lib/sound';

/** Home card for the seeded daily challenge — same round for everyone. */
export function DailyCard() {
  const state = useAppState();
  const key = dateKey();
  const game = dailyGameFor(key);
  const result = dailyResult(key, game.id);
  const streak = currentStreak(state);

  return (
    <section className="daily-card" aria-label="Tages-Challenge">
      <div className="daily-glow" aria-hidden />
      <div className="daily-icon" aria-hidden>
        {game.icon}
      </div>
      <div className="daily-copy">
        <p className="daily-kicker">
          Tages-Challenge · {prettyDate(key)}
          {streak > 0 ? <span className="daily-streak">🔥 {streak} {streak === 1 ? 'Tag' : 'Tage'} Serie</span> : null}
        </p>
        <h2>{game.name}</h2>
        <p className="muted small">
          {result !== null
            ? `Heute gespielt: ${formatNumber(result)} Punkte. Morgen gibt es eine neue Runde.`
            : 'Gleicher Seed für alle, ein Versuch zählt. Schaffst du den Tagesbestwert?'}
        </p>
      </div>
      <div className="daily-actions">
        <Link
          to={`/game/${game.id}?daily=1`}
          className="btn btn-primary"
          onClick={() => sfx.pick()}
        >
          {result !== null ? '↻ Nochmal spielen' : '▶ Heute spielen'}
        </Link>
        <span className="muted tiny">{game.category}</span>
      </div>
    </section>
  );
}

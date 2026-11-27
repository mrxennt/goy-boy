import { ACHIEVEMENTS, deriveStats, levelProgress, useAppState } from '../lib/store';
import { Link } from '../lib/router';
import { formatDuration, formatNumber } from '../lib/utils';

export function Achievements() {
  const state = useAppState();
  const stats = deriveStats(state);
  const progress = levelProgress(state.xp);
  const unlocked = state.achievements.length;
  const totalXp = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp, 0);
  const earnedXp = ACHIEVEMENTS.filter((a) => state.achievements.includes(a.id)).reduce((sum, a) => sum + a.xp, 0);

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Gamification</span>
        <h1>Erfolge & Level</h1>
        <p className="page-sub">
          Jede Runde bringt XP. Jeder Erfolg bringt Bonus-XP. Dein Level steigt alle {progress.goal} XP.
        </p>
      </header>

      <section className="level-banner">
        <div className="level-ring" aria-hidden>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="ring-track" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="ring-fill"
              strokeDasharray={`${(progress.pct / 100) * 327} 327`}
            />
          </svg>
          <span>{progress.level}</span>
        </div>
        <div className="level-copy">
          <h2>{state.profile.name}</h2>
          <p className="muted">
            {progress.into} von {progress.goal} XP bis Level {progress.level + 1} · {formatNumber(state.xp)} XP gesamt
          </p>
          <div className="xp-bar big">
            <span style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="level-facts">
            <span>🏆 {unlocked} / {ACHIEVEMENTS.length} Erfolge</span>
            <span>⚡ {formatNumber(earnedXp)} / {formatNumber(totalXp)} Erfolgs-XP</span>
            <span>⏱️ {formatDuration(stats.totalMs)} Spielzeit</span>
          </div>
        </div>
        <Link to="/games" className="btn btn-primary">
          Weiter spielen
        </Link>
      </section>

      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement) => {
          const done = state.achievements.includes(achievement.id);
          const value = achievement.value(state, stats);
          const pct = Math.min(100, Math.round((value / achievement.goal) * 100));
          return (
            <article key={achievement.id} className={`achievement-card ${done ? 'is-unlocked' : ''}`}>
              <span className="achievement-badge" aria-hidden>
                {achievement.icon}
              </span>
              <div className="achievement-card-body">
                <div className="achievement-top">
                  <h3>{achievement.name}</h3>
                  <span className={`pill ${done ? 'pill-success' : ''}`}>{done ? 'Freigeschaltet' : `+${achievement.xp} XP`}</span>
                </div>
                <p className="muted small">{achievement.desc}</p>
                <div className="mini-bar">
                  <span style={{ width: `${done ? 100 : pct}%` }} />
                </div>
                <small className="muted tiny">
                  {done ? 'Abgeschlossen' : `${Math.min(value, achievement.goal)} / ${achievement.goal}`}
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

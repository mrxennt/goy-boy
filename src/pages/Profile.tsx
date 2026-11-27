import { useState } from 'react';
import {
  ACHIEVEMENTS,
  AVATARS,
  deriveStats,
  levelProgress,
  updateProfile,
  useAppState,
} from '../lib/store';
import { GAMES, getGame } from '../data/games';
import { Link } from '../lib/router';
import { formatDate, formatDuration, formatNumber } from '../lib/utils';
import { FavoriteButton } from '../components/FavoriteButton';
import { sfx } from '../lib/sound';

export function Profile() {
  const state = useAppState();
  const stats = deriveStats(state);
  const progress = levelProgress(state.xp);
  const [name, setName] = useState(state.profile.name);

  const scores = Object.entries(state.records)
    .filter(([, record]) => record.best > 0)
    .map(([id, record]) => ({ game: getGame(id), record }))
    .filter((entry) => entry.game)
    .sort((a, b) => b.record.best - a.record.best)
    .slice(0, 10);

  return (
    <div className="page profile">
      <header className="profile-hero">
        <div className="profile-avatar" aria-hidden>
          {state.profile.avatar}
        </div>
        <div className="profile-id">
          <span className="eyebrow">Dein Profil</span>
          <div className="profile-name-row">
            <input
              className="profile-name-input"
              value={name}
              maxLength={24}
              aria-label="Benutzername"
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== state.profile.name) updateProfile({ name: trimmed });
                else setName(state.profile.name);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
            />
            <span className="level-pill">Level {progress.level}</span>
          </div>
          <div className="xp-block">
            <div className="xp-meta">
              <span>
                {progress.into} / {progress.goal} XP
              </span>
              <span>{state.xp} XP gesamt</span>
            </div>
            <div className="xp-bar">
              <span style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <Link to="/achievements" className="btn btn-outline btn-sm">
            Erfolge ansehen
          </Link>
          <Link to="/games" className="btn btn-primary btn-sm">
            Spiele entdecken
          </Link>
        </div>
      </header>

      <section className="avatar-row" aria-label="Profilbild wählen">
        <span className="muted small">Profilbild</span>
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            className={`avatar-option ${state.profile.avatar === avatar ? 'is-active' : ''}`}
            onClick={() => {
              updateProfile({ avatar });
              sfx.pick();
            }}
            aria-pressed={state.profile.avatar === avatar}
            aria-label={`Avatar ${avatar}`}
          >
            {avatar}
          </button>
        ))}
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Runden gespielt</span>
          <b>{formatNumber(stats.totalPlays)}</b>
          <small>{stats.uniqueGames} von {GAMES.length} Spielen entdeckt</small>
        </article>
        <article className="stat-card">
          <span>Gesamtspielzeit</span>
          <b>{formatDuration(stats.totalMs)}</b>
          <small>über alle Spiele hinweg</small>
        </article>
        <article className="stat-card">
          <span>Persönliche Rekorde</span>
          <b>{stats.records}</b>
          <small>Spiele mit Highscore</small>
        </article>
        <article className="stat-card">
          <span>Favoriten</span>
          <b>{state.favorites.length}</b>
          <small>von {GAMES.length} Spielen</small>
        </article>
        <article className="stat-card">
          <span>Erfolge</span>
          <b>
            {state.achievements.length}/{ACHIEVEMENTS.length}
          </b>
          <small>{stats.exploredCategories} von 6 Kategorien ausprobiert</small>
        </article>
        <article className="stat-card">
          <span>XP</span>
          <b>{formatNumber(state.xp)}</b>
          <small>Level {progress.level}</small>
        </article>
      </section>

      <div className="profile-columns">
        <section className="panel">
          <header className="panel-head">
            <h2>Erfolge</h2>
            <Link to="/achievements" className="section-more">
              Alle →
            </Link>
          </header>
          <ul className="achievement-list">
            {ACHIEVEMENTS.map((achievement) => {
              const unlocked = state.achievements.includes(achievement.id);
              const value = achievement.value(state, stats);
              const pct = Math.min(100, Math.round((value / achievement.goal) * 100));
              return (
                <li key={achievement.id} className={`achievement ${unlocked ? 'is-unlocked' : ''}`}>
                  <span className="achievement-icon" aria-hidden>
                    {achievement.icon}
                  </span>
                  <div className="achievement-body">
                    <div className="achievement-top">
                      <b>{achievement.name}</b>
                      <span className="muted tiny">+{achievement.xp} XP</span>
                    </div>
                    <small className="muted">{achievement.desc}</small>
                    <div className="mini-bar">
                      <span style={{ width: `${unlocked ? 100 : pct}%` }} />
                    </div>
                  </div>
                  <span className="achievement-state">{unlocked ? '✓' : `${Math.min(value, achievement.goal)}/${achievement.goal}`}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="profile-side">
          <section className="panel">
            <header className="panel-head">
              <h2>Bestleistungen</h2>
            </header>
            {scores.length ? (
              <ol className="score-list">
                {scores.map((entry, index) => (
                  <li key={entry.game!.id}>
                    <span className="score-rank">{index + 1}</span>
                    <span className="score-icon" aria-hidden>
                      {entry.game!.icon}
                    </span>
                    <div className="score-body">
                      <Link to={`/game/${entry.game!.id}`}>{entry.game!.name}</Link>
                      <small className="muted">{entry.record.plays} Runden</small>
                    </div>
                    <b className="score-value">{formatNumber(entry.record.best)}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Noch kein Rekord. Spiele mit Highscore und dein Bestwert landet hier.</p>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Verlauf</h2>
              <Link to="/recent" className="section-more">
                Alle →
              </Link>
            </header>
            {state.history.length ? (
              <ul className="history-list">
                {state.history.slice(0, 8).map((entry, index) => {
                  const game = getGame(entry.id);
                  if (!game) return null;
                  return (
                    <li key={`${entry.id}-${entry.at}-${index}`}>
                      <span className="score-icon" aria-hidden>
                        {game.icon}
                      </span>
                      <div className="score-body">
                        <Link to={`/game/${game.id}`}>{game.name}</Link>
                        <small className="muted">{formatDate(entry.at)}</small>
                      </div>
                      <FavoriteButton gameId={game.id} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted small">Dein Verlauf ist leer.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

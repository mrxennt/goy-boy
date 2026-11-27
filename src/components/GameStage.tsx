import type { ReactNode } from 'react';
import type { GameMeta } from '../data/games';
import { formatNumber } from '../lib/utils';
import { sfx } from '../lib/sound';
import type { GameSession } from '../games/types';

type GameStageProps = {
  game: GameMeta;
  session: GameSession;
  hud?: ReactNode;
  children: ReactNode;
};

export function GameStage({ game, session, hud, children }: GameStageProps) {
  const { status, score, best, result, outcome } = session;
  const showOverlay = status !== 'playing';

  return (
    <div className="stage">
      <div className="stage-hud">
        {game.score ? (
          <>
            <div className="hud-stat">
              <span>Score</span>
              <b>{formatNumber(score)}</b>
            </div>
            <div className="hud-stat">
              <span>Best</span>
              <b>{formatNumber(best)}</b>
            </div>
          </>
        ) : (
          <div className="hud-stat">
            <span>Modus</span>
            <b>{game.multiplayer ? '2 Spieler' : 'vs. KI'}</b>
          </div>
        )}
        {session.daily ? <span className="gstatus daily-badge">📅 Tages-Challenge</span> : null}
        {hud ? <div className="hud-extra">{hud}</div> : null}
        <div className="hud-actions">
          {status === 'playing' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={session.pause}>
              ⏸ Pause
            </button>
          ) : null}
          {status === 'paused' ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={session.resume}>
              ▶ Weiter
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={session.restart}>
            ↻ Neustart
          </button>
        </div>
      </div>

      <div className="stage-body">
        {children}

        {showOverlay ? (
          <div className={`stage-overlay ${status}`}>
            <div className="overlay-card">
              {status === 'idle' ? (
                <>
                  <div className="overlay-icon">{game.icon}</div>
                  <p className="overlay-kicker">{game.category}</p>
                  <h3>{game.name}</h3>
                  <p className="overlay-text">{game.desc}</p>
                  <p className="overlay-controls">
                    <span>Steuerung</span> {game.controls}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => {
                      sfx.start();
                      session.start();
                    }}
                  >
                    ▶ Spiel starten
                  </button>
                </>
              ) : null}

              {status === 'paused' ? (
                <>
                  <div className="overlay-icon">⏸</div>
                  <h3>Pausiert</h3>
                  <p className="overlay-text">Nimm dir die Zeit – der Score wartet.</p>
                  <div className="overlay-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        sfx.click();
                        session.resume();
                      }}
                    >
                      Weiter spielen
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={session.restart}>
                      Neustart
                    </button>
                  </div>
                </>
              ) : null}

              {status === 'over' ? (
                <>
                  <div className="overlay-icon">{result?.isRecord ? '🏆' : '💥'}</div>
                  <h3>{outcome ?? 'Game Over'}</h3>
                  {game.score ? (
                    <div className="overlay-score">
                      <div>
                        <span>Score</span>
                        <b>{formatNumber(result?.score ?? score)}</b>
                      </div>
                      <div>
                        <span>Best</span>
                        <b>{formatNumber(Math.max(best, result?.score ?? 0))}</b>
                      </div>
                    </div>
                  ) : null}
                  {result?.isRecord && game.score ? <p className="overlay-record">Neuer persönlicher Rekord!</p> : null}
                  <div className="overlay-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      onClick={() => {
                        sfx.start();
                        session.restart();
                      }}
                    >
                      ↻ Nochmal spielen
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

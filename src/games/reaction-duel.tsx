import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useKeys } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

type Phase = 'idle' | 'waiting' | 'go' | 'over';

export default function ReactionDuel({ session, game }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [message, setMessage] = useState('Drückt eine der Tasten, um die erste Runde zu starten.');
  const [lastTime, setLastTime] = useState<number | null>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const startAt = useRef(0);
  const timers = useRef<number[]>([]);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  function startRound() {
    clearTimers();
    setLastTime(null);
    setMessage('Warte auf Grün …');
    setPhase('waiting');
    const delay = 900 + Math.random() * 2300;
    later(() => {
      startAt.current = performance.now();
      setPhase('go');
      setMessage('JETZT!');
      sfx.point();
    }, delay);
  }

  function award(player: 1 | 2, note: string) {
    const next = { ...scoresRef.current };
    if (player === 1) next.p1 += 1;
    else next.p2 += 1;
    scoresRef.current = next;
    setScores(next);
    setPhase('over');
    setMessage(note);
    if (next.p1 >= 3 || next.p2 >= 3) {
      later(() => {
        finishRef.current(0, next.p1 >= 3 ? `Spieler 1 gewinnt ${next.p1}:${next.p2}` : `Spieler 2 gewinnt ${next.p2}:${next.p1}`);
      }, 900);
    } else {
      later(startRound, 1700);
    }
  }

  function press(player: 1 | 2) {
    if (session.status !== 'playing') return;
    if (phaseRef.current === 'idle' || phaseRef.current === 'over') return;
    if (phaseRef.current === 'waiting') {
      const other = player === 1 ? 2 : 1;
      sfx.error();
      award(other, `Zu früh gedrückt! Punkt für Spieler ${other}.`);
      return;
    }
    if (phaseRef.current === 'go') {
      const ms = Math.round(performance.now() - startAt.current);
      setLastTime(ms);
      sfx.win();
      award(player, `Spieler ${player} war in ${ms} ms schnell!`);
    }
  }

  useEffect(() => {
    clearTimers();
    setScores({ p1: 0, p2: 0 });
    scoresRef.current = { p1: 0, p2: 0 };
    setPhase('idle');
    setMessage('Drückt eine der Tasten, um die erste Runde zu starten.');
    setLastTime(null);
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    down: (key) => {
      const normalised = key.toLowerCase();
      if (normalised === 'f') press(1);
      else if (normalised === 'k') press(2);
    },
  });

  const waiting = phase === 'waiting';
  const go = phase === 'go';

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Spieler 1 <b>{scores.p1}</b></span>
          <span className="gstatus">Spieler 2 <b>{scores.p2}</b></span>
        </>
      }
    >
      <div className={`duel ${waiting ? 'is-waiting' : ''} ${go ? 'is-go' : ''}`}>
        <div className="duel-stage">
          <p className="duel-kicker">{waiting ? 'Noch nicht drücken' : go ? 'Drück jetzt!' : 'Bereit?'}</p>
          <h3 className="duel-title">
            {waiting ? '🔴' : go ? '🟢' : phase === 'over' ? '⏱' : '⚡'}
          </h3>
          <p className="duel-message">{message}</p>
          {lastTime !== null ? <p className="duel-time">{lastTime} ms</p> : null}
          {phase === 'idle' ? (
            <button type="button" className="btn btn-primary" onClick={startRound}>
              Runde starten
            </button>
          ) : null}
        </div>
        <div className="duel-players">
          <div className="duel-player">
            <span className="duel-key">F</span>
            <div>
              <b>Spieler 1</b>
              <div className="duel-dots">
                {[0, 1, 2].map((index) => (
                  <span key={index} className={scores.p1 > index ? 'is-on' : ''} />
                ))}
              </div>
            </div>
          </div>
          <div className="duel-player">
            <span className="duel-key">K</span>
            <div>
              <b>Spieler 2</b>
              <div className="duel-dots p2">
                {[0, 1, 2].map((index) => (
                  <span key={index} className={scores.p2 > index ? 'is-on' : ''} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="game-hint" style={{ marginTop: 10 }}>Best of five · zu früh drücken gibt den Punkt ab</p>
    </GameStage>
  );
}

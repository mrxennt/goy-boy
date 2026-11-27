import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

/** Leiterspiel — 4 players on one board, fixed 10×10 grid. */

const SNAKES: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
const LADDERS: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };

const PLAYER_COLORS = ['#f472b6', '#38bdf8', '#facc15', '#4ade80'];
const PLAYER_NAMES = ['Rot', 'Blau', 'Gelb', 'Grün'];

function cellPosition(number: number) {
  const index = number - 1;
  const row = Math.floor(index / 10);
  const col = row % 2 === 0 ? index % 10 : 9 - (index % 10);
  return { row, col };
}

export default function SnakeLadders({ session, game }: GameProps) {
  const [stored, setPlayers] = useDifficulty('snake-ladders', '2');
  const playerCount = stored === '3' || stored === '4' ? Number(stored) : 2;
  const [positions, setPositions] = useState<number[]>(() => Array(4).fill(1).map((value, index) => (index < playerCount ? value : 0)));
  const [turn, setTurn] = useState(0);
  const [roll, setRoll] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Rot würfelt. Wer zuerst 100 erreicht, gewinnt.');
  const [winner, setWinner] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  useEffect(() => {
    setPositions(Array(4).fill(1).map((value, index) => (index < playerCount ? value : 0)));
    setTurn(0);
    setRoll(null);
    setWinner(null);
    setBusy(false);
    setMessage(`${PLAYER_NAMES[0]} würfelt. Wer zuerst 100 erreicht, gewinnt.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, playerCount]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  function doRoll() {
    if (busy || winner !== null || session.status !== 'playing') return;
    setBusy(true);
    const value = 1 + Math.floor(Math.random() * 6);
    setRoll(value);
    sfx.pick();
    later(() => {
      const current = positions[turn];
      let target = current + value;
      if (target > 100) {
        setMessage(`${PLAYER_NAMES[turn]} würfelt ${value} – zu weit, bleibt stehen.`);
        setBusy(false);
        setTurn((turn + 1) % playerCount);
        return;
      }
      const snake = SNAKES[target];
      const ladder = LADDERS[target];
      let landing = target;
      let note = `${PLAYER_NAMES[turn]} würfelt ${value}: Feld ${target}.`;
      if (ladder) {
        landing = ladder;
        note = `${PLAYER_NAMES[turn]} klettert die Leiter von ${target} auf ${ladder}!`;
      } else if (snake) {
        landing = snake;
        note = `${PLAYER_NAMES[turn]} rutscht die Schlange von ${target} auf ${snake}.`;
      }
      if (value === 6 && target < 100) note += ' Sechs = noch einmal würfeln.';
      const next = [...positions];
      next[turn] = landing;
      setPositions(next);
      setMessage(note);
      if (ladder) sfx.point();
      else if (snake) sfx.hit();
      else sfx.click();
      if (landing === 100) {
        setWinner(turn);
        sfx.win();
        session.setScore(100);
        later(() => finishRef.current(400, `${PLAYER_NAMES[turn]} gewinnt`), 700);
        setBusy(false);
        return;
      }
      setBusy(false);
      if (value !== 6) setTurn((turn + 1) % playerCount);
    }, 320);
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          {Array.from({ length: playerCount }, (_, index) => (
            <span key={index} className="gstatus" style={{ color: PLAYER_COLORS[index] }}>
              {PLAYER_NAMES[index]} <b>{positions[index]}</b>
            </span>
          ))}
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              className={`gbtn ${playerCount === count ? 'is-active' : ''}`}
              onClick={() => setPlayers(String(count))}
            >
              {count} Spieler
            </button>
          ))}
        </div>
        <div className="ladders-board">
          {Array.from({ length: 100 }, (_, index) => {
            const number = 100 - index;
            const { row, col } = cellPosition(number);
            const isSnake = number in SNAKES;
            const isLadder = number in LADDERS;
            const here = Array.from({ length: playerCount }, (_, player) => player).filter(
              (player) => positions[player] === number,
            );
            return (
              <div
                key={number}
                className={`ladders-cell ${(row + col) % 2 === 0 ? 'is-a' : 'is-b'} ${isSnake ? 'is-snake' : ''} ${isLadder ? 'is-ladder' : ''}`}
              >
                <span className="ladders-number">{number}</span>
                {isSnake ? <span className="ladders-mark" aria-hidden>▼</span> : null}
                {isLadder ? <span className="ladders-mark" aria-hidden>▲</span> : null}
                <div className="ladders-tokens">
                  {here.map((player) => (
                    <span key={player} className="ladders-token" style={{ background: PLAYER_COLORS[player] }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ladders-actions">
          <span className="ladders-turn" style={{ color: PLAYER_COLORS[turn] }}>
            {winner !== null ? `${PLAYER_NAMES[winner]} hat gewonnen!` : `${PLAYER_NAMES[turn]} am Zug`}
          </span>
          <span className="ladders-die" aria-hidden>
            {roll ?? '–'}
          </span>
          <button type="button" className="btn btn-primary" onClick={doRoll} disabled={busy || winner !== null}>
            🎲 Würfeln
          </button>
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

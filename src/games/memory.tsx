import { useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import { pad, shuffle } from '../lib/utils';
import type { GameProps } from './types';

type LevelId = 'easy' | 'medium' | 'hard';

const LEVELS: Record<LevelId, { pairs: number; cols: number; label: string }> = {
  easy: { pairs: 8, cols: 4, label: '4×4' },
  medium: { pairs: 10, cols: 5, label: '4×5' },
  hard: { pairs: 18, cols: 6, label: '6×6' },
};

const SYMBOLS = ['🍕', '👾', '🚀', '🐙', '🎧', '🌵', '🐸', '🍩', '⚡', '🎲', '🦊', '🌙', '🔥', '🍄', '🐳', '🎈', '💎', '🪐'];

export default function Memory({ session, game }: GameProps) {
  const [level, setLevel] = useState<LevelId>('easy');
  const [deck, setDeck] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [won, setWon] = useState(false);
  const [busy, setBusy] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const config = LEVELS[level];

  const build = (nextLevel: LevelId) => {
    const cfg = LEVELS[nextLevel];
    const symbols = shuffle(SYMBOLS).slice(0, cfg.pairs);
    setDeck(shuffle([...symbols, ...symbols]));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setSeconds(0);
    setWon(false);
    setBusy(false);
  };

  useEffect(() => {
    build(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, level]);

  useEffect(() => {
    if (session.status !== 'playing' || won) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status, won]);

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const score = useMemo(() => Math.max(60, 1400 - moves * 35 - seconds * 4), [moves, seconds]);

  function flip(index: number) {
    if (session.status !== 'playing' || won || busy) return;
    if (flipped.includes(index) || matched.includes(index)) return;
    sfx.pick();
    const next = [...flipped, index];

    if (next.length < 2) {
      setFlipped(next);
      return;
    }

    setFlipped(next);
    setMoves((value) => value + 1);
    if (deck[next[0]] === deck[next[1]]) {
      const found = [...matched, next[0], next[1]];
      setMatched(found);
      setFlipped([]);
      sfx.point();
      if (found.length === deck.length) {
        setWon(true);
        window.setTimeout(() => session.finish(score, 'Alle Paare gefunden!'), 260);
      }
    } else {
      setBusy(true);
      timeoutRef.current = window.setTimeout(() => {
        setFlipped([]);
        setBusy(false);
      }, 720);
    }
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Paare <b>{matched.length / 2}/{config.pairs}</b></span>
          <span className="gstatus">Züge <b>{moves}</b></span>
          <span className="gstatus">⏱ <b>{pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(Object.keys(LEVELS) as LevelId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`gbtn ${level === id ? 'is-active' : ''}`}
              onClick={() => {
                setLevel(id);
                sfx.click();
              }}
            >
              {LEVELS[id].label}
            </button>
          ))}
        </div>

        <div className="memory-board" style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))` }}>
          {deck.map((symbol, index) => {
            const open = flipped.includes(index) || matched.includes(index);
            return (
              <button
                key={index}
                type="button"
                className={`memory-card ${open ? 'is-open' : ''} ${matched.includes(index) ? 'is-matched' : ''}`}
                onClick={() => flip(index)}
                aria-label={open ? `Karte ${symbol}` : 'Verdeckte Karte'}
              >
                <span className="memory-face back" aria-hidden>
                  ◆
                </span>
                <span className="memory-face front" aria-hidden>
                  {symbol}
                </span>
              </button>
            );
          })}
        </div>
        <p className="game-hint">Finde alle Paare. Weniger Züge und schnelle Zeit bedeuten mehr Punkte.</p>
      </div>
    </GameStage>
  );
}

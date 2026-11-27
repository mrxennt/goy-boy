import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useKeys } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

const SIZE = 4;

type Board = number[][];

const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));

function addTile(board: Board): Board {
  const free: { row: number; col: number }[] = [];
  board.forEach((row, r) => row.forEach((value, c) => value === 0 && free.push({ row: r, col: c })));
  if (!free.length) return board;
  const spot = free[Math.floor(Math.random() * free.length)];
  const next = board.map((row) => [...row]);
  next[spot.row][spot.col] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function collapse(line: number[]): { line: number[]; gained: number } {
  const numbers = line.filter((value) => value !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < numbers.length; i += 1) {
    if (numbers[i] === numbers[i + 1]) {
      const merged = numbers[i] * 2;
      out.push(merged);
      gained += merged;
      i += 1;
    } else {
      out.push(numbers[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { line: out, gained };
}

function transpose(board: Board): Board {
  return board[0].map((_, col) => board.map((row) => row[col]));
}

const TILE_STYLE: Record<number, { from: string; to: string; text: string }> = {
  2: { from: '#2c3350', to: '#20263c', text: '#dbeafe' },
  4: { from: '#3b3a68', to: '#2a2a4d', text: '#e0e7ff' },
  8: { from: '#7c3aed', to: '#5b21b6', text: '#fff' },
  16: { from: '#9333ea', to: '#6d28d9', text: '#fff' },
  32: { from: '#c026d3', to: '#86198f', text: '#fff' },
  64: { from: '#db2777', to: '#9d174d', text: '#fff' },
  128: { from: '#2563eb', to: '#1e40af', text: '#fff' },
  256: { from: '#0ea5e9', to: '#0369a1', text: '#fff' },
  512: { from: '#14b8a6', to: '#0f766e', text: '#fff' },
  1024: { from: '#f59e0b', to: '#b45309', text: '#1f2937' },
  2048: { from: '#facc15', to: '#eab308', text: '#1f2937' },
};

export default function Game2048({ session, game }: GameProps) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [reached, setReached] = useState(false);
  const [enders, setEnders] = useState(false);
  const boardRef = useRef<Board>(board);
  const scoreRef = useRef(0);
  const overRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function reset() {
    const base = addTile(addTile(emptyBoard()));
    boardRef.current = base;
    scoreRef.current = 0;
    overRef.current = false;
    setBoard(base);
    setReached(false);
    setEnders(false);
    session.setScore(0);
  }

  function canMove(candidate: Board) {
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (candidate[r][c] === 0) return true;
        if (c + 1 < SIZE && candidate[r][c] === candidate[r][c + 1]) return true;
        if (r + 1 < SIZE && candidate[r][c] === candidate[r + 1][c]) return true;
      }
    }
    return false;
  }

  function move(direction: 'left' | 'right' | 'up' | 'down') {
    if (session.status !== 'playing' || overRef.current) return;
    const current = boardRef.current;
    let working: Board = current.map((row) => [...row]);
    let gained = 0;

    if (direction === 'up' || direction === 'down') working = transpose(working);

    working = working.map((row) => {
      const reversed = direction === 'right' || direction === 'down';
      const input = reversed ? [...row].reverse() : row;
      const result = collapse(input);
      gained += result.gained;
      return reversed ? [...result.line].reverse() : result.line;
    });

    if (direction === 'up' || direction === 'down') working = transpose(working);

    if (JSON.stringify(working) === JSON.stringify(current)) return;

    const next = addTile(working);
    boardRef.current = next;
    setBoard(next);
    scoreRef.current += gained;
    session.setScore(scoreRef.current);
    if (gained > 0) sfx.point();
    else sfx.click();
    if (next.flat().includes(2048)) setReached(true);

    if (!canMove(next)) {
      overRef.current = true;
      setEnders(true);
      window.setTimeout(() => session.finish(scoreRef.current, 'Kein Zug mehr möglich'), 240);
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    down: (key) => {
      if (key === 'ArrowLeft' || key === 'a') move('left');
      else if (key === 'ArrowRight' || key === 'd') move('right');
      else if (key === 'ArrowUp' || key === 'w') move('up');
      else if (key === 'ArrowDown' || key === 's') move('down');
    },
  });

  return (
    <GameStage game={game} session={session} hud={reached ? <span className="gstatus">🎉 2048 erreicht</span> : undefined}>
      <div className="game-wrap">
        <div
          className="board-wrap"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
            if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
            else move(dy > 0 ? 'down' : 'up');
            touchStart.current = null;
          }}
        >
          <div className="board square t2048">
            {board.flatMap((row, r) =>
              row.map((value, c) => {
                const style = TILE_STYLE[value];
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`cell tile2048 ${value ? 'has-value' : ''} ${value > 999 ? 'small' : ''}`}
                    style={
                      style
                        ? { background: `linear-gradient(150deg, ${style.from}, ${style.to})`, color: style.text }
                        : undefined
                    }
                  >
                    {value || ''}
                  </div>
                );
              }),
            )}
          </div>
        </div>
        <div className="touch-pad t2048-pad">
          <button type="button" className="touch-btn up" onClick={() => move('up')} aria-label="Hoch">
            ▲
          </button>
          <button type="button" className="touch-btn left" onClick={() => move('left')} aria-label="Links">
            ◀
          </button>
          <button type="button" className="touch-btn down" onClick={() => move('down')} aria-label="Runter">
            ▼
          </button>
          <button type="button" className="touch-btn right" onClick={() => move('right')} aria-label="Rechts">
            ▶
          </button>
        </div>
        <p className="game-hint">
          {enders ? 'Kein Zug mehr möglich.' : 'Pfeiltasten, WASD oder wischen. Gleiche Zahlen verschmelzen.'}
        </p>
      </div>
    </GameStage>
  );
}

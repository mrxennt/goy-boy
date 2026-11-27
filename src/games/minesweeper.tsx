import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import { pad } from '../lib/utils';
import type { GameProps } from './types';

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; count: number };
type LevelId = 'easy' | 'medium' | 'hard';

const LEVELS: Record<LevelId, { rows: number; cols: number; mines: number; label: string }> = {
  easy: { rows: 9, cols: 9, mines: 10, label: 'Leicht · 9×9' },
  medium: { rows: 12, cols: 12, mines: 26, label: 'Mittel · 12×12' },
  hard: { rows: 16, cols: 16, mines: 48, label: 'Schwer · 16×16' },
};

const NUMBER_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fbbf24', '#22d3ee', '#f472b6', '#e2e8f0'];

const createBoard = (rows: number, cols: number): Cell[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, count: 0 })));

const cloneBoard = (board: Cell[][]): Cell[][] => board.map((row) => row.map((cell) => ({ ...cell })));

export default function Minesweeper({ session, game }: GameProps) {
  const [level, setLevel] = useState<LevelId>('easy');
  const [board, setBoard] = useState<Cell[][]>(() => createBoard(9, 9));
  const [seconds, setSeconds] = useState(0);
  const [flagMode, setFlagMode] = useState(false);
  const [statusText, setStatusText] = useState('Klicke ein Feld – der erste Klick ist immer sicher.');
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const timerRef = useRef<number | null>(null);

  const config = LEVELS[level];

  function reset(nextLevel: LevelId = level) {
    const cfg = LEVELS[nextLevel];
    setBoard(createBoard(cfg.rows, cfg.cols));
    setSeconds(0);
    setFinished(false);
    started.current = false;
    setStatusText('Klicke ein Feld – der erste Klick ist immer sicher.');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useEffect(() => {
    reset(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    if (session.status !== 'playing' || finished) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => setSeconds((value) => Math.min(3599, value + 1)), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [session.status, finished]);

  function plantMines(source: Cell[][], safeRow: number, safeCol: number) {
    const next = cloneBoard(source);
    const { rows, cols, mines } = LEVELS[level];
    let placed = 0;
    while (placed < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      if (next[r][c].mine) continue;
      if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
      next[r][c].mine = true;
      placed += 1;
    }
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (next[r][c].mine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && next[nr][nc].mine) count += 1;
          }
        }
        next[r][c].count = count;
      }
    }
    return next;
  }

  function checkWin(source: Cell[][]) {
    return source.every((row) => row.every((cell) => cell.mine || cell.revealed));
  }

  function animateReveal(source: Cell[][]) {
    return source.map((row) => row.map((cell) => ({ ...cell })));
  }

  function open(row: number, col: number) {
    if (session.status !== 'playing' || finished) return;
    let working = board;
    if (!started.current) {
      started.current = true;
      working = plantMines(board, row, col);
    }
    if (working[row][col].revealed || working[row][col].flagged) return;

    const next = animateReveal(working);
    if (next[row][col].mine) {
      next.forEach((line) => line.forEach((cell) => {
        if (cell.mine) cell.revealed = true;
      }));
      next[row][col].revealed = true;
      setBoard(next);
      setFinished(true);
      sfx.hit();
      session.finish(0, 'Mine getroffen!');
      return;
    }

    const stack: [number, number][] = [[row, col]];
    let opened = 0;
    while (stack.length) {
      const [r, c] = stack.pop() as [number, number];
      const cell = next[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      opened += 1;
      if (cell.count === 0) {
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols && !next[nr][nc].revealed) stack.push([nr, nc]);
          }
        }
      }
    }
    setBoard(next);
    if (opened > 0) sfx.pick();

    if (checkWin(next)) {
      setFinished(true);
      sfx.win();
      session.finish(0, `Feld geräumt in ${seconds}s`);
    }
  }

  function toggleFlag(row: number, col: number) {
    if (session.status !== 'playing' || finished) return;
    const cell = board[row][col];
    if (cell.revealed) return;
    const next = cloneBoard(board);
    next[row][col].flagged = !next[row][col].flagged;
    setBoard(next);
    sfx.click();
  }

  const flags = board.flat().filter((cell) => cell.flagged).length;
  const remaining = Math.max(0, config.mines - flags);

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">💣 <b>{remaining}</b></span>
          <span className="gstatus">⏱ <b>{pad(seconds)}</b></span>
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
          <button
            type="button"
            className={`gbtn ${flagMode ? 'is-active' : ''}`}
            onClick={() => {
              const next = !flagMode;
              setFlagMode(next);
              setStatusText(next ? 'Flaggen-Modus aktiv: Klick setzt eine Flagge.' : 'Klicke ein Feld – der erste Klick ist immer sicher.');
              sfx.click();
            }}
          >
            🚩 Flaggen-Modus {flagMode ? 'AN' : 'AUS'}
          </button>
        </div>

        <div className="board-wrap">
          <div
            className="ms-board"
            style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`, width: `min(100%, ${config.cols * 34}px)` }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {board.map((line, r) =>
              line.map((cell, c) => {
                const content = cell.revealed
                  ? cell.mine
                    ? '💥'
                    : cell.count || ''
                  : cell.flagged
                    ? '🚩'
                    : '';
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={`ms-cell ${cell.revealed ? 'is-revealed' : ''} ${cell.mine && cell.revealed ? 'is-mine' : ''} ${
                      cell.flagged ? 'is-flagged' : ''
                    }`}
                    style={
                      cell.revealed && cell.count
                        ? { color: NUMBER_COLORS[cell.count] ?? '#fff', fontSize: config.cols > 12 ? 11 : 15 }
                        : undefined
                    }
                    onClick={() => (flagMode ? toggleFlag(r, c) : open(r, c))}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      toggleFlag(r, c);
                    }}
                    aria-label={`Feld ${r + 1}-${c + 1}`}
                  >
                    {content}
                  </button>
                );
              }),
            )}
          </div>
        </div>
        <p className="game-hint">{statusText} Rechtsklick setzt Flaggen.</p>
      </div>
    </GameStage>
  );
}

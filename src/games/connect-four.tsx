import { useCallback, useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const AI = 2;

type Board = number[][];
const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));

function dropRow(board: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

function winningCells(board: Board, player: number): [number, number][] | null {
  const directions: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of directions) {
        const cells: [number, number][] = [];
        for (let step = 0; step < 4; step += 1) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

function isFull(board: Board) {
  return board[0].every((cell) => cell !== 0);
}

function evaluateBoard(board: Board): number {
  let score = 0;
  const evaluateWindow = (window: number[]) => {
    const aiCount = window.filter((cell) => cell === AI).length;
    const playerCount = window.filter((cell) => cell === PLAYER).length;
    const empty = window.filter((cell) => cell === 0).length;
    if (aiCount === 4) score += 100000;
    else if (aiCount === 3 && empty === 1) score += 120;
    else if (aiCount === 2 && empty === 2) score += 14;
    else if (playerCount === 3 && empty === 1) score -= 160;
    else if (playerCount === 2 && empty === 2) score -= 18;
    else if (playerCount === 4) score -= 100000;
  };

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (c + 3 < COLS) evaluateWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
      if (r + 3 < ROWS) evaluateWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
      if (r + 3 < ROWS && c + 3 < COLS) evaluateWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
      if (r + 3 < ROWS && c - 3 >= 0) evaluateWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]]);
    }
  }
  for (let r = 0; r < ROWS; r += 1) {
    if (board[r][3] === AI) score += 8;
    if (board[r][3] === PLAYER) score -= 8;
  }
  return score;
}

function search(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (winningCells(board, AI)) return 90000 + depth * 10;
  if (winningCells(board, PLAYER)) return -90000 - depth * 10;
  if (isFull(board) || depth === 0) return evaluateBoard(board);

  if (maximizing) {
    let best = -Infinity;
    for (let c = 0; c < COLS; c += 1) {
      const r = dropRow(board, c);
      if (r < 0) continue;
      board[r][c] = AI;
      best = Math.max(best, search(board, depth - 1, alpha, beta, false));
      board[r][c] = 0;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  for (let c = 0; c < COLS; c += 1) {
    const r = dropRow(board, c);
    if (r < 0) continue;
    board[r][c] = PLAYER;
    best = Math.min(best, search(board, depth - 1, alpha, beta, true));
    board[r][c] = 0;
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function chooseColumn(board: Board, depth: number): number {
  const valid = Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(board, c) >= 0);
  if (!valid.length) return -1;
  let bestScore = -Infinity;
  let bestColumns: number[] = [];
  for (const c of valid) {
    const r = dropRow(board, c);
    board[r][c] = AI;
    const score = search(board, depth, -Infinity, Infinity, false);
    board[r][c] = 0;
    if (score > bestScore + 6) {
      bestScore = score;
      bestColumns = [c];
    } else if (Math.abs(score - bestScore) <= 6) {
      bestColumns.push(c);
    }
  }
  return bestColumns[Math.floor(Math.random() * bestColumns.length)] ?? valid[0];
}

export default function ConnectFour({ session, game }: GameProps) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [message, setMessage] = useState('Du bist Rot und beginnst. Klicke eine Spalte.');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [highlight, setHighlight] = useState<[number, number][]>([]);
  const [locked, setLocked] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const endGame = useCallback((label: string) => {
    setLocked(true);
    window.setTimeout(() => finishRef.current(0, label), 500);
  }, []);

  useEffect(() => {
    setBoard(emptyBoard());
    setTurn('player');
    setLocked(false);
    setHighlight([]);
    setMessage('Du bist Rot und beginnst. Klicke eine Spalte.');
  }, [session.run]);

  useEffect(() => {
    if (session.status !== 'playing' || turn !== 'ai' || locked) return;
    const timer = window.setTimeout(() => {
      const working = boardRef.current.map((row) => [...row]);
      const depth = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 3 : 5;
      const column = difficulty === 'easy' && Math.random() < 0.3 ? Math.floor(Math.random() * COLS) : chooseColumn(working, depth);
      if (column < 0) return;
      const row = dropRow(working, column);
      if (row < 0) return;
      working[row][column] = AI;
      setBoard(working);
      sfx.click();
      const win = winningCells(working, AI);
      if (win) {
        setHighlight(win);
        setMessage('Die KI gewinnt diese Runde.');
        endGame('Niederlage gegen die KI');
        return;
      }
      if (isFull(working)) {
        setMessage('Unentschieden – das Feld ist voll.');
        endGame('Unentschieden');
        return;
      }
      setTurn('player');
    }, 420);
    return () => window.clearTimeout(timer);
  }, [turn, board, difficulty, locked, session.status, endGame]);

  function play(column: number) {
    if (session.status !== 'playing' || turn !== 'player' || locked) return;
    const working = board.map((row) => [...row]);
    const row = dropRow(working, column);
    if (row < 0) return;
    working[row][column] = PLAYER;
    setBoard(working);
    sfx.pick();
    const win = winningCells(working, PLAYER);
    if (win) {
      setHighlight(win);
      setMessage('Vier in einer Reihe – gewonnen!');
      sfx.win();
      endGame('Sieg gegen die KI');
      return;
    }
    if (isFull(working)) {
      setMessage('Unentschieden – das Feld ist voll.');
      endGame('Unentschieden');
      return;
    }
    setTurn('ai');
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={<span className="gstatus">{turn === 'player' ? 'Du bist am Zug' : 'KI denkt…'}</span>}
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(['easy', 'normal', 'hard'] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={`gbtn ${difficulty === level ? 'is-active' : ''}`}
              onClick={() => {
                setDifficulty(level);
                sfx.click();
              }}
            >
              {level === 'easy' ? 'Leicht' : level === 'normal' ? 'Mittel' : 'Schwer'}
            </button>
          ))}
        </div>

        <div className="c4-board" role="grid" aria-label="Connect Four Spielfeld">
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isWin = highlight.some(([wr, wc]) => wr === r && wc === c);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  className={`c4-cell ${cell === PLAYER ? 'is-player' : ''} ${cell === AI ? 'is-ai' : ''} ${isWin ? 'is-win' : ''}`}
                  onClick={() => play(c)}
                  aria-label={`Zeile ${r + 1} Spalte ${c + 1}`}
                >
                  <span />
                </button>
              );
            }),
          )}
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

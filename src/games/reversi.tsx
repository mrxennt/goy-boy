import { useCallback, useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

const SIZE = 8;
const EMPTY = 0;
const PLAYER = 1;
const AI = 2;
const DIRS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

const WEIGHTS = [
  [120, -25, 22, 8, 8, 22, -25, 120],
  [-25, -45, -6, -6, -6, -6, -45, -25],
  [22, -6, 14, 3, 3, 14, -6, 22],
  [8, -6, 3, 2, 2, 3, -6, 8],
  [8, -6, 3, 2, 2, 3, -6, 8],
  [22, -6, 14, 3, 3, 14, -6, 22],
  [-25, -45, -6, -6, -6, -6, -45, -25],
  [120, -25, 22, 8, 8, 22, -25, 120],
];

type Board = number[][];

function startBoard(): Board {
  const board = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(EMPTY));
  board[3][3] = AI;
  board[3][4] = PLAYER;
  board[4][3] = PLAYER;
  board[4][4] = AI;
  return board;
}

function collectFlips(board: Board, row: number, col: number, player: number): [number, number][] {
  if (board[row][col] !== EMPTY) return [];
  const opponent = player === PLAYER ? AI : PLAYER;
  const flips: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === opponent) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
      flips.push(...line);
    }
  }
  return flips;
}

function allMoves(board: Board, player: number): { row: number; col: number; flips: [number, number][] }[] {
  const moves: { row: number; col: number; flips: [number, number][] }[] = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const flips = collectFlips(board, r, c, player);
      if (flips.length) moves.push({ row: r, col: c, flips });
    }
  }
  return moves;
}

function applyMove(board: Board, row: number, col: number, player: number, flips: [number, number][]): Board {
  const next = board.map((line) => [...line]);
  next[row][col] = player;
  for (const [r, c] of flips) next[r][c] = player;
  return next;
}

function count(board: Board) {
  let player = 0;
  let ai = 0;
  board.forEach((row) => row.forEach((cell) => {
    if (cell === PLAYER) player += 1;
    if (cell === AI) ai += 1;
  }));
  return { player, ai };
}

function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === AI) score += WEIGHTS[r][c];
      else if (board[r][c] === PLAYER) score -= WEIGHTS[r][c];
    }
  }
  score += allMoves(board, AI).length * 8 - allMoves(board, PLAYER).length * 8;
  const { player, ai } = count(board);
  score += (ai - player) * 1.2;
  return score;
}

function search(board: Board, depth: number, alpha: number, beta: number, player: number): number {
  const moves = allMoves(board, player);
  if (!moves.length) {
    if (!allMoves(board, player === AI ? PLAYER : AI).length) {
      const { player: p, ai } = count(board);
      return (ai - p) * 120;
    }
    return search(board, depth, alpha, beta, player === AI ? PLAYER : AI);
  }
  if (depth === 0) return evaluate(board);

  if (player === AI) {
    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, move.row, move.col, AI, move.flips);
      best = Math.max(best, search(next, depth - 1, alpha, beta, PLAYER));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const next = applyMove(board, move.row, move.col, PLAYER, move.flips);
    best = Math.min(best, search(next, depth - 1, alpha, beta, AI));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function chooseAiMove(board: Board): { row: number; col: number; flips: [number, number][] } | null {
  const moves = allMoves(board, AI);
  if (!moves.length) return null;
  let bestScore = -Infinity;
  let best: { row: number; col: number; flips: [number, number][] } | null = null;
  for (const move of moves) {
    const next = applyMove(board, move.row, move.col, AI, move.flips);
    const score = search(next, 3, -Infinity, Infinity, PLAYER);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

export default function Reversi({ session, game }: GameProps) {
  const [board, setBoard] = useState<Board>(startBoard);
  const [turn, setTurn] = useState<number>(PLAYER);
  const [message, setMessage] = useState('Du spielst Schwarz und beginnst.');
  const [locked, setLocked] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const end = useCallback((label: string) => {
    setLocked(true);
    window.setTimeout(() => finishRef.current(0, label), 500);
  }, []);

  useEffect(() => {
    setBoard(startBoard());
    setTurn(PLAYER);
    setLocked(false);
    setMessage('Du spielst Schwarz und beginnst.');
  }, [session.run]);

  useEffect(() => {
    if (session.status !== 'playing' || locked) return;
    const current = boardRef.current;
    const moves = allMoves(current, turn);
    if (!moves.length) {
      const other = turn === PLAYER ? AI : PLAYER;
      if (!allMoves(current, other).length) {
        const { player, ai } = count(current);
        const label =
          player === ai ? `Remis ${player}:${ai}` : player > ai ? `Gewonnen ${player}:${ai}!` : `Verloren ${player}:${ai}`;
        end(label);
        return;
      }
      const timer = window.setTimeout(() => {
        setTurn(other);
        setMessage(turn === PLAYER ? 'Du kannst nicht ziehen – die KI ist dran.' : 'Die KI muss passen – du bist dran.');
      }, 700);
      return () => window.clearTimeout(timer);
    }

    if (turn === AI) {
      const timer = window.setTimeout(() => {
        const move = chooseAiMove(current);
        if (!move) return;
        setBoard(applyMove(current, move.row, move.col, AI, move.flips));
        sfx.click();
        setTurn(PLAYER);
        setMessage(`KI setzt auf ${'abcdefgh'[move.col]}${move.row + 1}. Du bist dran.`);
      }, 480);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [turn, board, locked, session.status, end]);

  function play(row: number, col: number) {
    if (session.status !== 'playing' || locked || turn !== PLAYER) return;
    const flips = collectFlips(board, row, col, PLAYER);
    if (!flips.length) {
      sfx.error();
      setMessage('Dieses Feld ist kein gültiger Zug.');
      return;
    }
    setBoard(applyMove(board, row, col, PLAYER, flips));
    sfx.pick();
    setTurn(AI);
    setMessage(`${flips.length} Steine umgedreht.`);
  }

  const stats = count(board);
  const playerMoves = allMoves(board, PLAYER);
  const valid = new Set(playerMoves.map((move) => move.row * SIZE + move.col));

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">⚫ <b>{stats.player}</b></span>
          <span className="gstatus">⚪ <b>{stats.ai}</b></span>
          <span className="gstatus">{turn === PLAYER ? 'Du' : 'KI'} am Zug</span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="reversi-board" role="grid" aria-label="Reversi Spielfeld">
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                role="gridcell"
                className={`reversi-cell ${cell === PLAYER ? 'is-black' : cell === AI ? 'is-white' : ''} ${
                  turn === PLAYER && valid.has(r * SIZE + c) ? 'is-valid' : ''
                }`}
                onClick={() => play(r, c)}
                aria-label={`${'abcdefgh'[c]}${r + 1}`}
              >
                {cell ? <span className="reversi-disc" /> : null}
              </button>
            )),
          )}
        </div>
        <p className="game-hint">{message} · Grün markierte Felder sind spielbar.</p>
      </div>
    </GameStage>
  );
}

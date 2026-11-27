import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

type Mark = 'X' | 'O';
type Cell = Mark | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(board: Cell[]): Mark | 'draw' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function minimax(board: Cell[], player: Mark): { score: number; move: number } {
  const result = winner(board);
  if (result === 'O') return { score: 10, move: -1 };
  if (result === 'X') return { score: -10, move: -1 };
  if (result === 'draw') return { score: 0, move: -1 };

  let bestScore = player === 'O' ? -Infinity : Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i += 1) {
    if (board[i]) continue;
    board[i] = player;
    const { score } = minimax(board, player === 'O' ? 'X' : 'O');
    board[i] = null;
    if (player === 'O' ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return { score: bestScore, move: bestMove };
}

function aiPick(board: Cell[], difficulty: 'easy' | 'perfect'): number {
  const free = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
  if (!free.length) return -1;
  if (difficulty === 'easy' && Math.random() < 0.55) {
    return free[Math.floor(Math.random() * free.length)];
  }
  const { move } = minimax([...board], 'O');
  return move >= 0 ? move : free[0];
}

export default function TicTacToeAI({ session, game }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(Array<Cell>(9).fill(null));
  const [difficultyStored, setDifficultyStored] = useDifficulty('tictactoe-ai', 'perfect');
  const difficulty = difficultyStored === 'easy' ? 'easy' : 'perfect';
  const setDifficulty = (level: 'easy' | 'perfect') => setDifficultyStored(level);
  const [message, setMessage] = useState('Du spielst X und beginnst.');
  const [scores, setScores] = useState({ win: 0, draw: 0, loss: 0 });
  const [locked, setLocked] = useState(false);
  const finishedRef = useRef(false);
  const boardRef = useRef<Cell[]>(board);
  boardRef.current = board;

  function resetBoard() {
    setBoard(Array<Cell>(9).fill(null));
    setMessage('Du spielst X und beginnst.');
    setLocked(false);
    finishedRef.current = false;
  }

  useEffect(() => {
    setScores({ win: 0, draw: 0, loss: 0 });
    resetBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useEffect(() => {
    if (session.status !== 'playing' || locked) return;
    const current = boardRef.current;
    if (current.filter(Boolean).length % 2 === 0) return;
    const timer = window.setTimeout(() => {
      const next = [...boardRef.current];
      const move = aiPick(next, difficulty);
      if (move < 0) return;
      next[move] = 'O';
      setBoard(next);
      sfx.click();
      const result = winner(next);
      if (result === 'O') {
        setMessage('Die KI gewinnt. Revanche?');
        setScores((value) => ({ ...value, loss: value.loss + 1 }));
        lockedFinish('Niederlage');
      } else if (result === 'draw') {
        setMessage('Unentschieden – gut verteidigt.');
        setScores((value) => ({ ...value, draw: value.draw + 1 }));
        lockedFinish('Unentschieden');
      }
    }, 420 + Math.random() * 600);
    return () => window.clearTimeout(timer);
  }, [board, difficulty, locked, session.status]);

  function lockedFinish(label: string) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setLocked(true);
    window.setTimeout(() => session.finish(0, label), 500);
  }

  function play(index: number) {
    if (session.status !== 'playing' || board[index] || locked) return;
    const next = [...board];
    next[index] = 'X';
    setBoard(next);
    sfx.pick();
    const result = winner(next);
    if (result === 'X') {
      setMessage('Gewonnen! Das war stark.');
      setScores((value) => ({ ...value, win: value.win + 1 }));
      sfx.win();
      lockedFinish('Sieg gegen die KI');
    } else if (result === 'draw') {
      setMessage('Unentschieden.');
      setScores((value) => ({ ...value, draw: value.draw + 1 }));
      lockedFinish('Unentschieden');
    }
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">S <b>{scores.win}</b></span>
          <span className="gstatus">U <b>{scores.draw}</b></span>
          <span className="gstatus">N <b>{scores.loss}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          <button
            type="button"
            className={`gbtn ${difficulty === 'easy' ? 'is-active' : ''}`}
            onClick={() => {
              setDifficulty('easy');
              resetBoard();
            }}
          >
            Leicht
          </button>
          <button
            type="button"
            className={`gbtn ${difficulty === 'perfect' ? 'is-active' : ''}`}
            onClick={() => {
              setDifficulty('perfect');
              resetBoard();
            }}
          >
            Unschlagbar
          </button>
          <button type="button" className="gbtn" onClick={resetBoard}>
            Neue Runde
          </button>
        </div>

        <div className="board-wrap">
          <div className="board square ttt-board">
            {board.map((cell, index) => (
              <button
                key={index}
                type="button"
                className={`ttt-cell ${cell ? `is-${cell.toLowerCase()}` : ''}`}
                onClick={() => play(index)}
                aria-label={`Feld ${index + 1}`}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import {
  AI,
  AI_LEVELS,
  PLAYER,
  chooseColumn,
  dropRow,
  emptyBoard,
  isFull,
  winningCells,
  type AiLevel,
  type Board,
} from './lib/connectfour';

export default function ConnectFour({ session, game }: GameProps) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [message, setMessage] = useState('Du bist Rot und beginnst. Klicke eine Spalte.');
  const [difficultyStored, setDifficultyStored] = useDifficulty('connect-four', 'normal');
  const difficulty = (difficultyStored in AI_LEVELS ? difficultyStored : 'normal') as AiLevel;
  const setDifficulty = (level: AiLevel) => setDifficultyStored(level);
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
      const column = chooseColumn(working, difficulty);
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
    }, 520 + Math.random() * 900);
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
          {(Object.keys(AI_LEVELS) as AiLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`gbtn ${difficulty === level ? 'is-active' : ''}`}
              onClick={() => {
                setDifficulty(level);
                sfx.click();
              }}
            >
              {AI_LEVELS[level].label}
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

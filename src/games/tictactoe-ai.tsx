import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { LEVELS, aiPick, winner, type Cell, type Level } from './lib/tictactoe';

export default function TicTacToeAI({ session, game }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(Array<Cell>(9).fill(null));
  const [stored, setStored] = useDifficulty('tictactoe-ai', 'normal');
  const difficulty = (stored in LEVELS ? stored : 'normal') as Level;
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
    const config = LEVELS[difficulty];
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
    }, (420 + Math.random() * 600) * config.pace);
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
          {(Object.keys(LEVELS) as Level[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`gbtn ${difficulty === level ? 'is-active' : ''}`}
              onClick={() => {
                setStored(level);
                resetBoard();
              }}
            >
              {LEVELS[level].label}
            </button>
          ))}
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

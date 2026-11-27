import { useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import {
  applyMove,
  chooseAiMove,
  colOf,
  findWinner,
  legalMoves,
  rowOf,
  startBoard,
  type Board,
  type Move,
  type Side,
} from './lib/checkers';

/**
 * Checkers / Dame. The board is a fixed 8×8 CSS grid with explicit rows and
 * columns, so the squares keep exactly one size for the whole game.
 */

const LEVELS = {
  easy: { depth: 2, slip: 0.35, label: 'Leicht' },
  medium: { depth: 4, slip: 0.12, label: 'Mittel' },
  hard: { depth: 6, slip: 0, label: 'Stark' },
} as const;
type LevelId = keyof typeof LEVELS;

export default function Checkers({ session, game }: GameProps) {
  const [stored, setLevel] = useDifficulty('checkers', 'medium');
  const levelId = (stored in LEVELS ? stored : 'medium') as LevelId;
  const [board, setBoard] = useState<Board>(startBoard);
  const [turn, setTurn] = useState<Side>('r');
  const [selected, setSelected] = useState<number | null>(null);
  const [forcedFrom, setForcedFrom] = useState<number | null>(null);
  const [message, setMessage] = useState('Blau beginnt. Blau = du, Creme (oben) = KI.');
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const thinking = useRef(0);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  useEffect(() => {
    setBoard(startBoard());
    setTurn('r');
    setSelected(null);
    setForcedFrom(null);
    setLastMove(null);
    setWinner(null);
    setMessage('Blau beginnt. Blau = du, Creme (oben) = KI.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, levelId]);

  const moves = useMemo(() => (winner ? [] : legalMoves(board, turn)), [board, turn, winner]);
  const targets = useMemo(() => {
    if (selected === null) return [];
    return legalMoves(board, 'r').filter((move) => move.from === selected);
  }, [board, selected]);

  useEffect(() => {
    if (winner) return;
    const result = findWinner(board, turn);
    if (!result) return;
    setWinner(result);
    const label = result === 'r' ? 'Du gewinnst!' : 'Die KI gewinnt.';
    setMessage(label);
    if (result === 'r') sfx.win();
    else sfx.lose();
    window.setTimeout(() => {
      const pieces = board.filter((piece) => piece?.side === 'r').length;
      finishRef.current(result === 'r' ? 400 + pieces * 20 : 0, label);
    }, 700);
  }, [board, turn, winner]);

  // the AI answers after a human pause, never instantly
  useEffect(() => {
    if (winner || turn !== 'b') return;
    const delay = 620 + Math.random() * 900;
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(board, LEVELS[levelId].depth, LEVELS[levelId].slip);
      if (!move) return;
      setBoard(applyMove(board, move));
      setLastMove({ from: move.from, to: move.to });
      setTurn('r');
      setMessage(move.captured !== null ? 'Die KI schlägt.' : 'Die KI zieht.');
      sfx.click();
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, turn, winner, levelId]);

  function play(move: Move) {
    const next = applyMove(board, move);
    setBoard(next);
    setLastMove({ from: move.from, to: move.to });
    if (move.captured !== null) {
      sfx.hit();
      const further = legalMoves(next, 'r').filter((candidate) => candidate.from === move.to && candidate.captured !== null);
      if (further.length) {
        setSelected(move.to);
        setForcedFrom(move.to);
        setMessage('Weiter schlagen! Springe erneut mit der gleichen Dame.');
        return;
      }
    } else {
      sfx.pick();
    }
    setSelected(null);
    setForcedFrom(null);
    setTurn('b');
    setMessage('Die KI überlegt …');
    thinking.current += 1;
  }

  function clickSquare(index: number) {
    if (winner || turn !== 'r' || session.status !== 'playing') return;
    if (forcedFrom !== null && index !== forcedFrom && !targets.some((move) => move.to === index)) return;
    const target = targets.find((move) => move.to === index);
    if (target) {
      play(target);
      return;
    }
    const piece = board[index];
    if (piece && piece.side === 'r' && (!moves.some((move) => move.captured) || moves.some((move) => move.from === index))) {
      setSelected(index === selected ? null : index);
      sfx.pick();
      return;
    }
    setSelected(null);
  }

  const redCount = board.filter((piece) => piece?.side === 'r').length;
  const blackCount = board.filter((piece) => piece?.side === 'b').length;

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#93c5fd' }}>Du <b>{redCount}</b></span>
          <span className="gstatus" style={{ color: '#fde68a' }}>KI <b>{blackCount}</b></span>
          <span className="gstatus">{turn === 'r' ? 'Du bist dran' : 'KI am Zug'}</span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(Object.keys(LEVELS) as LevelId[]).map((id) => (
            <button key={id} type="button" className={`gbtn ${levelId === id ? 'is-active' : ''}`} onClick={() => setLevel(id)}>
              {LEVELS[id].label}
            </button>
          ))}
        </div>
        <div className="checkers-board">
          {board.map((piece, index) => {
            const row = rowOf(index);
            const col = colOf(index);
            const dark = (row + col) % 2 === 1;
            const isTarget = targets.some((move) => move.to === index);
            return (
              <button
                key={index}
                type="button"
                className={[
                  'checkers-square',
                  dark ? 'is-dark' : 'is-light',
                  selected === index ? 'is-selected' : '',
                  isTarget ? 'is-target' : '',
                  lastMove && (lastMove.from === index || lastMove.to === index) ? 'is-last' : '',
                ].join(' ')}
                onClick={() => clickSquare(index)}
                aria-label={`${String.fromCharCode(97 + col)}${8 - row}`}
              >
                {piece ? (
                  <span className={`checkers-piece is-${piece.side} ${piece.king ? 'is-king' : ''}`} aria-hidden>
                    {piece.king ? '♛' : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

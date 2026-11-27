import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useKeys } from '../lib/hooks';
import { sfx } from '../lib/sound';
import { makeRng, shuffled, type Rng } from '../lib/rng';
import { consumeResume, loadRun, saveRun } from '../lib/runs';
import { pad } from '../lib/utils';
import type { GameProps } from './types';

type Difficulty = 'easy' | 'medium' | 'hard';
type SavedSudoku = {
  puzzle: number[];
  solution: number[];
  grid: number[];
  difficulty: Difficulty;
  seconds: number;
  hints: number;
  won: boolean;
};

/** Seeded for daily rounds, plain randomness otherwise. */
let gridRng: Rng = () => Math.random();

const REMOVE: Record<Difficulty, number> = { easy: 38, medium: 48, hard: 56 };

function isValid(grid: number[], row: number, col: number, value: number) {
  for (let i = 0; i < 9; i += 1) {
    if (grid[row * 9 + i] === value) return false;
    if (grid[i * 9 + col] === value) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r += 1) {
    for (let c = bc; c < bc + 3; c += 1) {
      if (grid[r * 9 + c] === value) return false;
    }
  }
  return true;
}

function fill(grid: number[], index = 0): boolean {
  if (index === 81) return true;
  if (grid[index] !== 0) return fill(grid, index + 1);
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (const value of shuffled(gridRng, [1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isValid(grid, row, col, value)) {
      grid[index] = value;
      if (fill(grid, index + 1)) return true;
      grid[index] = 0;
    }
  }
  return false;
}

function countSolutions(grid: number[], limit = 2): number {
  const index = grid.indexOf(0);
  if (index === -1) return 1;
  const row = Math.floor(index / 9);
  const col = index % 9;
  let total = 0;
  for (let value = 1; value <= 9; value += 1) {
    if (!isValid(grid, row, col, value)) continue;
    grid[index] = value;
    total += countSolutions(grid, limit - total);
    grid[index] = 0;
    if (total >= limit) break;
  }
  return total;
}

function createPuzzle(difficulty: Difficulty): { puzzle: number[]; solution: number[] } {
  const solution = new Array<number>(81).fill(0);
  fill(solution);
  const puzzle = [...solution];
  const order = shuffled(gridRng, Array.from({ length: 81 }, (_, i) => i));
  let removed = 0;
  for (const index of order) {
    if (removed >= REMOVE[difficulty]) break;
    const backup = puzzle[index];
    if (backup === 0) continue;
    puzzle[index] = 0;
    if (countSolutions([...puzzle]) !== 1) puzzle[index] = backup;
    else removed += 1;
  }
  return { puzzle, solution };
}

export default function Sudoku({ session, game }: GameProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [puzzle, setPuzzle] = useState<number[]>([]);
  const [solution, setSolution] = useState<number[]>([]);
  const [grid, setGrid] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [hints, setHints] = useState(3);
  const [won, setWon] = useState(false);
  const [message, setMessage] = useState('Wähle ein leeres Feld und tippe eine Ziffer.');

  const generate = useCallback((level: Difficulty) => {
    gridRng = session.daily ? makeRng(session.daily.seed) : () => Math.random();
    const resumed = consumeResume('sudoku') ? loadRun<SavedSudoku>('sudoku') : null;
    if (resumed && Array.isArray(resumed.grid) && resumed.grid.length === 81) {
      setDifficulty(resumed.difficulty ?? level);
      setPuzzle(resumed.puzzle);
      setSolution(resumed.solution);
      setGrid(resumed.grid);
      setSelected(null);
      setSeconds(resumed.seconds ?? 0);
      setHints(resumed.hints ?? 3);
      setWon(Boolean(resumed.won));
      setMessage('Runde fortgesetzt – dein Feld ist noch da.');
      return;
    }
    const result = createPuzzle(level);
    setPuzzle(result.puzzle);
    setSolution(result.solution);
    setGrid([...result.puzzle]);
    setSelected(null);
    setSeconds(0);
    setHints(3);
    setWon(false);
    setMessage('Wähle ein leeres Feld und tippe eine Ziffer.');
  }, [session.daily?.seed]);

  useEffect(() => {
    generate(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, difficulty, session.daily?.seed]);

  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  useEffect(() => {
    if (grid.length !== 81) return;
    saveRun<SavedSudoku>('sudoku', {
      puzzle,
      solution,
      grid,
      difficulty,
      seconds: secondsRef.current,
      hints,
      won,
    });
  }, [puzzle, solution, grid, difficulty, hints, won]);

  useEffect(() => {
    if (session.status !== 'playing' || won) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status, won]);

  const conflicts = useMemo(() => {
    const bad = new Set<number>();
    for (let i = 0; i < 81; i += 1) {
      const value = grid[i];
      if (!value) continue;
      const row = Math.floor(i / 9);
      const col = i % 9;
      for (let j = 0; j < 81; j += 1) {
        if (j === i || grid[j] !== value) continue;
        const row2 = Math.floor(j / 9);
        const col2 = j % 9;
        const sameBox = Math.floor(row / 3) === Math.floor(row2 / 3) && Math.floor(col / 3) === Math.floor(col2 / 3);
        if (row === row2 || col === col2 || sameBox) {
          bad.add(i);
          bad.add(j);
        }
      }
    }
    return bad;
  }, [grid]);

  function setCell(index: number, value: number) {
    if (session.status !== 'playing' || won) return;
    if (!grid.length || puzzle[index] !== 0) return;
    const next = [...grid];
    next[index] = value;
    setGrid(next);

    if (value !== 0) {
      if (value === solution[index]) sfx.point();
      else sfx.error();
    } else {
      sfx.click();
    }

    if (next.every((cell, i) => cell === solution[i])) {
      setWon(true);
      sfx.win();
      session.finish(0, `Sudoku gelöst in ${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`);
    }
  }

  function useHint() {
    if (hints <= 0 || won) return;
    const target = selected !== null && grid[selected] !== solution[selected] ? selected : grid.findIndex((value, i) => value !== solution[i]);
    if (target < 0) return;
    const next = [...grid];
    next[target] = solution[target];
    setGrid(next);
    setHints((value) => value - 1);
    setSelected(target);
    sfx.pick();
    if (next.every((cell, i) => cell === solution[i])) {
      setWon(true);
      session.finish(0, 'Mit Hilfe gelöst');
    }
  }

  useKeys({
    active: session.status === 'playing',
    down: (key) => {
      if (key >= '1' && key <= '9') {
        if (selected !== null) setCell(selected, Number(key));
      } else if (key === 'Backspace' || key === 'Delete' || key === '0') {
        if (selected !== null) setCell(selected, 0);
      } else if (key.startsWith('Arrow') && selected !== null) {
        const row = Math.floor(selected / 9);
        const col = selected % 9;
        if (key === 'ArrowUp') setSelected(Math.max(0, row - 1) * 9 + col);
        if (key === 'ArrowDown') setSelected(Math.min(8, row + 1) * 9 + col);
        if (key === 'ArrowLeft') setSelected(row * 9 + Math.max(0, col - 1));
        if (key === 'ArrowRight') setSelected(row * 9 + Math.min(8, col + 1));
      }
    },
  });

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">⏱ <b>{pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</b></span>
          <span className="gstatus">💡 <b>{hints}</b></span>
        </>
      }
    >
      <div className="game-wrap sudoku-wrap">
        <div className="game-toolbar">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`gbtn ${difficulty === level ? 'is-active' : ''}`}
              onClick={() => {
                setDifficulty(level);
                sfx.click();
              }}
            >
              {level === 'easy' ? 'Leicht' : level === 'medium' ? 'Mittel' : 'Schwer'}
            </button>
          ))}
          <button type="button" className="gbtn" onClick={useHint}>
            💡 Hinweis
          </button>
        </div>

        <div className="sudoku-board" role="grid" aria-label="Sudoku Spielfeld">
          {grid.map((value, index) => {
            const row = Math.floor(index / 9);
            const col = index % 9;
            const isGiven = puzzle[index] !== 0;
            const isSelected = selected === index;
            const sameRowOrCol =
              selected !== null &&
              (Math.floor(selected / 9) === row ||
                selected % 9 === col ||
                (Math.floor(selected / 27) === Math.floor(row / 3) && Math.floor((selected % 9) / 3) === Math.floor(col / 3)));
            return (
              <button
                key={index}
                type="button"
                role="gridcell"
                className={[
                  'sudoku-cell',
                  isGiven ? 'is-given' : '',
                  isSelected ? 'is-selected' : '',
                  sameRowOrCol ? 'is-related' : '',
                  conflicts.has(index) ? 'is-conflict' : '',
                  (col + 1) % 3 === 0 && col !== 8 ? 'edge-right' : '',
                  (row + 1) % 3 === 0 && row !== 8 ? 'edge-bottom' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(index)}
              >
                {value || ''}
              </button>
            );
          })}
        </div>

        <div className="sudoku-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              type="button"
              className="sudoku-digit"
              onClick={() => selected !== null && setCell(selected, digit)}
            >
              {digit}
            </button>
          ))}
          <button type="button" className="sudoku-digit erase" onClick={() => selected !== null && setCell(selected, 0)}>
            ⌫
          </button>
        </div>
        <p className="game-hint">{won ? 'Gelöst! Stark.' : message}</p>
      </div>
    </GameStage>
  );
}

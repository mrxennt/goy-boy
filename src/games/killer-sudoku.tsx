import { useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty, useKeys } from '../lib/hooks';
import { makeRng } from '../lib/rng';
import { generateSheet, type Cage } from './lib/killer';
import { consumeResume, loadRun, saveRun } from '../lib/runs';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

/** Killer Sudoku: cages marked with dashed borders, every cage sums to its clue. */

type LevelId = 'easy' | 'medium' | 'hard';
type Saved = { puzzle: number[]; givens: boolean[]; values: number[]; cages: Cage[]; seconds: number };

const LEVELS: Record<LevelId, { label: string; gaps: number }> = {
  easy: { label: 'Leicht', gaps: 30 },
  medium: { label: 'Mittel', gaps: 44 },
  hard: { label: 'Schwer', gaps: 54 },
};

export default function KillerSudoku({ session, game }: GameProps) {
  const [level, setLevel] = useDifficulty('killer-sudoku', 'medium');
  const levelId = (level in LEVELS ? level : 'medium') as LevelId;
  const [seed, setSeed] = useState(() => session.daily?.seed ?? Math.floor(Math.random() * 1e9));
  const [seconds, setSeconds] = useState(0);
  const [values, setValues] = useState<number[]>(() => Array(81).fill(0));
  const [givens, setGivens] = useState<boolean[]>(() => Array(81).fill(false));
  const [sel, setSel] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const loaded = useRef(false);
  const grid = useMemo(() => generateSheet(seed), [seed]);
  const puzzle = grid.puzzle;
  const cages = grid.cages;
  const cageOf = useMemo(() => {
    const map = Array.from({ length: 81 }, () => -1);
    cages.forEach((cage, index) => cage.cells.forEach((cell) => (map[cell] = index)));
    return map;
  }, [cages]);

  /** Pre-filled cells: always the cage starts plus a random remainder. */
  function initialValues(gaps: number) {
    const rng = makeRng(seed ^ 0x5f5f);
    const forced = new Set<number>();
    cages.forEach((cage) => forced.add(cage.cells[0]));
    const keep = 81 - gaps;
    while (forced.size < keep) forced.add(Math.floor(rng() * 81));
    const next = puzzle.map((value, index) => (forced.has(index) ? value : 0));
    const fixed = next.map((value) => value !== 0);
    return { next, givens: fixed };
  }

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (consumeResume('killer-sudoku')) {
      const saved = loadRun<Saved>('killer-sudoku');
      if (saved && Array.isArray(saved.values) && saved.values.length === 81 && Array.isArray(saved.cages)) {
        setValues(saved.values);
        setGivens(saved.givens);
        setSeconds(saved.seconds ?? 0);
        return;
      }
    }
    const init = initialValues(LEVELS[levelId].gaps);
    setValues(init.next);
    setGivens(init.givens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.status !== 'playing' || won) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status, won]);

  useEffect(() => {
    if (!values.length) return;
    saveRun<Saved>('killer-sudoku', { puzzle, givens, values, cages, seconds });
  }, [puzzle, givens, values, cages, seconds]);

  useEffect(() => {
    const init = initialValues(LEVELS[levelId].gaps);
    setValues(init.next);
    setGivens(init.givens);
    setWon(false);
    setSeconds(0);
    if (session.daily) setSeed(session.daily.seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, levelId, session.daily?.seed]);

  const conflicts = useMemo(() => {
    const marks = Array.from({ length: 81 }, () => false);
    const check = (cells: number[]) => {
      const seen = new Map<number, number[]>();
      cells.forEach((cell) => {
        const value = values[cell];
        if (!value) return;
        const list = seen.get(value) ?? [];
        list.push(cell);
        seen.set(value, list);
      });
      seen.forEach((list) => {
        if (list.length > 1) list.forEach((cell) => (marks[cell] = true));
      });
    };
    for (let i = 0; i < 9; i += 1) {
      check(Array.from({ length: 9 }, (_, j) => i * 9 + j));
      check(Array.from({ length: 9 }, (_, j) => j * 9 + i));
      const br = Math.floor(i / 3) * 3;
      const bc = (i % 3) * 3;
      check(Array.from({ length: 9 }, (_, j) => (br + Math.floor(j / 3)) * 9 + bc + (j % 3)));
    }
    cages.forEach((cage) => {
      const total = cage.cells.reduce((sum, cell) => sum + values[cell], 0);
      if (total > cage.sum) cage.cells.forEach((cell) => (marks[cell] = true));
    });
    return marks;
  }, [values, cages]);

  useEffect(() => {
    if (!values.length || won || session.status !== 'playing') return;
    if (values.every((value) => value > 0) && !conflicts.some(Boolean)) {
      setWon(true);
      sfx.win();
      const score = Math.max(200, 4200 - seconds * 3 - levelId.length * 40);
      window.setTimeout(() => session.finish(score, `Killer-Sudoku gelöst in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`), 500);
    }
  }, [values, conflicts, seconds, session, levelId, won]);

  function setDigit(digit: number) {
    if (sel === null || givens[sel] || won || session.status !== 'playing') return;
    setValues((current) => current.map((value, index) => (index === sel ? (value === digit ? 0 : digit) : value)));
    if (digit) sfx.click();
  }

  useKeys({
    active: session.status === 'playing',
    down: (key) => {
      if (/^[1-9]$/.test(key)) setDigit(Number(key));
      else if (key === 'Backspace' || key === 'Delete' || key === '0') setDigit(0);
      else if (key.startsWith('Arrow') && sel !== null) {
        const row = Math.floor(sel / 9);
        const col = sel % 9;
        const nextRow = key === 'ArrowUp' ? (row + 8) % 9 : key === 'ArrowDown' ? (row + 1) % 9 : row;
        const nextCol = key === 'ArrowLeft' ? (col + 8) % 9 : key === 'ArrowRight' ? (col + 1) % 9 : col;
        setSel(nextRow * 9 + nextCol);
      }
    },
  });

  const cageRemaining = (index: number) => {
    const cage = cages[cageOf[index]];
    return cage.sum - cage.cells.reduce((sum, cell) => sum + values[cell], 0);
  };

  const isCageStart = (cell: number) => cages[cageOf[cell]].cells[0] === cell;

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">{LEVELS[levelId].label}</span>
          <span className="gstatus">⏱ <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</b></span>
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
          <button
            type="button"
            className="gbtn"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 1e9));
              setSel(null);
              sfx.click();
            }}
          >
            🎲 Neues Gitter
          </button>
        </div>

        <div className="ksudoku-board">
          {values.map((value, index) => {
            const cage = cages[cageOf[index]];
            const row = Math.floor(index / 9);
            const col = index % 9;
            const selected = sel === index;
            const same = sel !== null && values[sel] !== 0 && values[index] === values[sel];
            return (
              <button
                key={index}
                type="button"
                className={[
                  'ksudoku-cell',
                  `cage-${cage.color}`,
                  givens[index] ? 'is-given' : '',
                  selected ? 'is-selected' : '',
                  same ? 'is-same' : '',
                  conflicts[index] ? 'is-conflict' : '',
                  col % 3 === 2 && col < 8 ? 'edge-right' : '',
                  row % 3 === 2 && row < 8 ? 'edge-bottom' : '',
                  cage.cells.includes(index - 9) ? 'no-top' : '',
                  cage.cells.includes(index - 1) ? 'no-left' : '',
                ].join(' ')}
                onClick={() => {
                  setSel(index);
                  sfx.pick();
                }}
              >
                {isCageStart(index) ? <span className="ksudoku-sum">{cage.sum}</span> : null}
                <span className={`ksudoku-value ${value && cageRemaining(index) < 0 ? 'is-spent' : ''}`}>{value || ''}</span>
              </button>
            );
          })}
        </div>

        <div className="game-toolbar">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((digit) => (
            <button key={digit} type="button" className="sudoku-digit" onClick={() => setDigit(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className="sudoku-digit erase" onClick={() => setDigit(0)} aria-label="Löschen">
            ⌫
          </button>
        </div>
        <p className="game-hint">Käfige ergeben die Zahl oben links. Jede Zeile, Spalte und jeder 3×3-Block enthält 1–9 genau einmal.</p>
      </div>
    </GameStage>
  );
}

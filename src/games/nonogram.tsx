import { useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { consumeResume, loadRun, saveRun } from '../lib/runs';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { cluesForLine, makePuzzle } from './lib/nonogram';

type Mark = boolean | null;
type SavedNonogram = { seed: number; marks: Mark[][]; seconds: number };

const LEVELS = {
  easy: { size: 8, density: 0.42, label: 'Leicht 8×8' },
  medium: { size: 10, density: 0.4, label: 'Mittel 10×10' },
  hard: { size: 11, density: 0.38, label: 'Schwer 11×11' },
} as const;

type LevelId = keyof typeof LEVELS;

export default function Nonogram({ session, game }: GameProps) {
  const [level, setLevel] = useDifficulty('nonogram', 'easy');
  const levelId = (level in LEVELS ? level : 'easy') as LevelId;
  const [seed, setSeed] = useState(() => session.daily?.seed ?? Math.floor(Math.random() * 1_000_000));
  const [marks, setMarks] = useState<Mark[][]>(() => []);
  const [seconds, setSeconds] = useState(0);
  const [won, setWon] = useState(false);
  const dragging = useRef<{ value: boolean; visited: Set<string> } | null>(null);
  const resumed = useRef(false);

  const config = LEVELS[levelId];
  const puzzle = useMemo(() => makePuzzle({ size: config.size, seed, density: config.density }), [config.size, config.density, seed]);
  const size = puzzle.size;

  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (consumeResume('nonogram')) {
      const saved = loadRun<SavedNonogram>('nonogram');
      if (saved && typeof saved.seed === 'number' && Array.isArray(saved.marks) && saved.marks.length === size) {
        setSeed(saved.seed);
        setMarks(saved.marks);
        setSeconds(saved.seconds ?? 0);
        return;
      }
    }
    const fresh: Mark[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
    // one square is filled in to start, so the rule is visible at a glance
    outer: for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (puzzle.solution[row][col] && puzzle.rows[row].length === 1 && puzzle.cols[col].length === 1) {
          fresh[row][col] = true;
          break outer;
        }
      }
    }
    setMarks(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.status !== 'playing' || won) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status, won]);

  const freshBoard = () => Array.from({ length: size }, () => Array.from({ length: size }, () => null));

  // reset on restart, level change or a new daily puzzle — but not on the first render, that would
  // wipe the board set up above and leave the grid untouchable
  const firstPass = useRef(true);
  useEffect(() => {
    if (firstPass.current) {
      firstPass.current = false;
      return;
    }
    setMarks(freshBoard());
    setWon(false);
    setSeconds(0);
    if (session.daily) setSeed(session.daily.seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, levelId, session.daily?.seed]);

  useEffect(() => {
    if (!marks.length) return;
    saveRun<SavedNonogram>('nonogram', { seed, marks, seconds });
  }, [seed, marks, seconds]);

  useEffect(() => {
    if (!marks.length || won || session.status !== 'playing') return;
    // solved = every clue satisfied (with × as empty) and the picture complete:
    // no empty square left that belongs to the hidden drawing
    let ok = true;
    for (let row = 0; row < size && ok; row += 1) {
      if (cluesForLine(marks[row].map((mark) => mark === true)).join(',') !== puzzle.rows[row].join(',')) ok = false;
    }
    for (let col = 0; col < size && ok; col += 1) {
      if (cluesForLine(marks.map((line) => line[col] === true)).join(',') !== puzzle.cols[col].join(',')) ok = false;
    }
    for (let row = 0; row < size && ok; row += 1) {
      for (let col = 0; col < size && ok; col += 1) {
        if (puzzle.solution[row][col] && marks[row][col] !== true) ok = false;
      }
    }
    if (!ok) return;
    setWon(true);
    const score = Math.max(120, size * size * 12 - seconds * 2);
    sfx.win();
    window.setTimeout(() => session.finish(score, `${size}×${size} gelöst in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`), 400);
  }, [marks, puzzle, seconds, session, size, won]);

  function paint(row: number, col: number, value: boolean) {
    setMarks((current) => {
      if (!current.length) return current;
      if (current[row][col] === value) return current;
      const next = current.map((line) => [...line]);
      next[row][col] = value;
      return next;
    });
    dragging.current?.visited.add(`${row},${col}`);
  }

  function newPuzzle() {
    setSeed(Math.floor(Math.random() * 1_000_000));
    setMarks(freshBoard());
    setWon(false);
    setSeconds(0);
    sfx.click();
  }

  function clearBoard() {
    setMarks(freshBoard());
    sfx.click();
  }

  const rowSatisfied = (row: number) =>
    marks.length > 0 && cluesForLine(marks[row].map((mark) => mark === true)).join(',') === puzzle.rows[row].join(',');
  const colSatisfied = (col: number) =>
    marks.length > 0 && cluesForLine(marks.map((line) => line[col] === true)).join(',') === puzzle.cols[col].join(',');

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">{config.label}</span>
          <span className="gstatus">⏱ <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(Object.keys(LEVELS) as LevelId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`gbtn ${levelId === id ? 'is-active' : ''}`}
              onClick={() => {
                setLevel(id);
                setSeed(Math.floor(Math.random() * 1_000_000));
                sfx.click();
              }}
            >
              {LEVELS[id].label}
            </button>
          ))}
          <button type="button" className="gbtn" onClick={newPuzzle}>
            🎲 Neues Bild
          </button>
          <button type="button" className="gbtn" onClick={clearBoard}>
            ⌫ Leeren
          </button>
        </div>

        <div
          className="nono-board"
          style={{
            ['--nono-size' as string]: size,
            ['--nono-cell' as string]: size >= 12 ? '26px' : size >= 10 ? '30px' : '34px',
          }}
        >
          <div className="nono-corner" />
          <div className="nono-clues nono-clues-col" style={{ gridArea: `1 / 2 / 2 / ${size + 2}`, display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)` }}>
            {puzzle.cols.map((clue, col) => (
              <div key={col} className={`nono-clue ${colSatisfied(col) ? 'is-done' : ''}`}>
                {clue.map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
              </div>
            ))}
          </div>
          {puzzle.rows.map((clue, row) => (
            <div key={row} className="nono-line" style={{ display: 'contents' }} aria-rowindex={row}>
              <div className={`nono-clues nono-clues-row ${rowSatisfied(row) ? 'is-done' : ''}`}>
                {clue.map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
              </div>
              {Array.from({ length: size }, (_, col) => {
                const mark = marks[row]?.[col] ?? null;
                return (
                  <button
                    key={col}
                    type="button"
                    className={`nono-cell ${mark === true ? 'is-filled' : ''} ${mark === false ? 'is-cross' : ''} ${(col + 1) % 5 === 0 && col < size - 1 ? 'edge-5' : ''} ${(row + 1) % 5 === 0 && row < size - 1 ? 'edge-5-row' : ''}`}
                    onPointerDown={(event) => {
                      if (session.status !== 'playing' || won) return;
                      event.preventDefault();
                      const value = mark === true ? false : true;
                      dragging.current = { value, visited: new Set([`${row},${col}`]) };
                      paint(row, col, value);
                      if (value) sfx.pick();
                      else sfx.click();
                    }}
                    onPointerEnter={() => {
                      if (!dragging.current) return;
                      if (dragging.current.visited.has(`${row},${col}`)) return;
                      paint(row, col, dragging.current.value);
                    }}
                    onPointerUp={() => {
                      dragging.current = null;
                    }}
                    aria-label={`Zeile ${row + 1}, Spalte ${col + 1}`}
                  >
                    {mark === false ? <span aria-hidden>×</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="game-hint">
          Klicken füllt, erneut klicken setzt × (leer), Ziehen füllt mehrere Felder. Jede Zahl zählt einen Block aus gefüllten
          Feldern – grüne Zahlen sind schon erfüllt.
        </p>
      </div>
    </GameStage>
  );
}

